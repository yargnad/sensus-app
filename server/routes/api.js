const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');
const Submission = require('../models/Submission');
const path = require('path');

// Multer config for file uploads
// ... existing code ...
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;
const GEMINI_VISION_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;

async function getEmotionalVector(submission) {
    const maxRetries = 3;
    let attempt = 0;
    let delay = 5000; // Start with a 5-second delay

    while (attempt < maxRetries) {
        try {
            let requestBody;
            let apiUrl;

            if (submission.contentType === 'text') {
                apiUrl = GEMINI_API_URL;
                requestBody = {
                    contents: [{
                        parts: [{
                            text: `Analyze the following text and provide a concise emotional summary as a comma-separated list of 5-10 keywords (e.g., hopeful, melancholic, serene, chaotic, joyful): "${submission.content}"`
                        }]
                    }]
                };
            } else if (submission.contentType === 'image') {
                apiUrl = GEMINI_VISION_API_URL;
                const imageBytes = fs.readFileSync(submission.content).toString('base64');
                requestBody = {
                    contents: [{
                        parts: [
                            { text: "Analyze the following image and provide a concise emotional summary as a comma-separated list of 5-10 keywords (e.g., hopeful, melancholic, serene, chaotic, joyful)." },
                            { inline_data: { mime_type: "image/jpeg", data: imageBytes } }
                        ]
                    }]
                };
            } else {
                console.log('Audio analysis not yet implemented, returning generic vector.');
                return ['neutral'];
            }

            const response = await axios.post(apiUrl, requestBody);
            const summary = response.data.candidates[0].content.parts[0].text;
            return summary.split(',').map(kw => kw.trim().toLowerCase());

        } catch (error) {
            const errorMessage = error.response ? (error.response.data.error ? error.response.data.error.message : error.response.data) : error.message;
            console.error(`Error on attempt ${attempt + 1}:`, errorMessage);

            if (errorMessage.includes('overloaded') && attempt < maxRetries - 1) {
                console.log(`Model overloaded. Retrying in ${delay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 3; // Increase delay for next retry (5s, 15s)
                attempt++;
            } else {
                // If it's not an overload error or we've run out of retries, return the error.
                if (errorMessage.includes('overloaded')) {
                    return ['overloaded'];
                }
                return ['error', errorMessage];
            }
        }
    }
}


async function findAndPairMatch(submission) {
    // Atomically find a suitable unmatched submission and update it to prevent race conditions.
    // This operation finds a document and updates it in a single atomic step.

    // First try: semantic match based on emotional vector overlap.
    const match = await Submission.findOneAndUpdate(
        {
            // Find criteria
            status: 'unmatched',
            _id: { $ne: submission._id },
            emotionalVector: { $in: submission.emotionalVector }
        },
        {
            // Update to apply atomically
            $set: {
                status: 'matched',
                matchedWith: submission._id
            }
        },
        {
            // Options
            new: true, // Return the document *after* the update has been applied
            sort: { createdAt: 'desc' } // Prefer the most recent semantic match
        }
    );
    return match;
}


// @route   POST api/submit
// @desc    Create a new submission and find a match
// @access  Public
router.post('/submit', upload.single('file'), async (req, res) => {
    try {
        const { sessionToken, text } = req.body;

        // --- 24-Hour Submission Limit Check ---
        if (sessionToken) {
            const lastSubmission = await Submission.findOne({ sessionToken }).sort({ createdAt: -1 });
            if (lastSubmission) {
                const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                if (lastSubmission.createdAt > twentyFourHoursAgo) {
                    return res.status(429).json({ 
                        msg: 'You can only submit once every 24 hours.',
                        lastSubmissionTime: lastSubmission.createdAt,
                        lastSubmissionId: lastSubmission._id // Send back the ID
                    });
                }
            }
        }
        
        const newSessionToken = sessionToken || crypto.randomBytes(16).toString('hex');
        
        let newSubmission;

        if (text) {
            newSubmission = new Submission({
                contentType: 'text',
                content: text,
                sessionToken: newSessionToken
            });
        } else if (req.file) {
            newSubmission = new Submission({
                contentType: req.file.mimetype.startsWith('image') ? 'image' : 'audio',
                content: req.file.path,
                sessionToken: newSessionToken
            });
        } else {
            return res.status(400).json({ msg: 'No content submitted.' });
        }

        // 1. Get emotional vector from Gemini
        const vector = await getEmotionalVector(newSubmission);
        newSubmission.emotionalVector = vector;
        // Don't save yet, we need to see if we find a match first.

        // 2. Try to find and pair a match atomically
        const match = await findAndPairMatch(newSubmission);

        if (match) {
            // 3. If match found, update our new submission to complete the pair
            newSubmission.status = 'matched';
            newSubmission.matchedWith = match._id;
            await newSubmission.save();

            // The 'match' document is already updated in the DB by findOneAndUpdate.
            // Now we return the matched content to the user who just submitted.
            res.json({
                status: 'matched',
                matchData: {
                    contentType: match.contentType,
                    content: match.content
                },
                sessionToken: newSessionToken,
                submissionTime: newSubmission.createdAt,
                submissionId: newSubmission._id
            });
        } else {
            // 4. If no match, save the new submission as 'unmatched' and wait.
            await newSubmission.save();
            res.json({
                status: 'waiting',
                submissionId: newSubmission._id,
                sessionToken: newSessionToken,
                submissionTime: newSubmission.createdAt
            });
        }

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/check/:id
// @desc    Check the status of a submission
// @access  Public
// ... existing code ...
router.get('/check/:id', async (req, res) => {
    try {
        const submission = await Submission.findById(req.params.id);

        if (!submission) {
            return res.status(404).json({ msg: 'Submission not found' });
        }

        if (submission.status === 'matched') {
            const match = await Submission.findById(submission.matchedWith);
            res.json({
                status: 'matched',
                matchData: {
                    contentType: match.contentType,
                    content: match.content
                }
            });
        } else {
            res.json({ status: 'waiting' });
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;

// --- Status endpoint: return last non-sensitive startup log entry (NDJSON) ---
// GET /api/status
router.get('/status', async (req, res) => {
    try {
        const logPath = path.join(__dirname, '..', '.startup.log');

        // Helper to extract host from a Mongo URI if needed
        function getDbHostFromUri(uri) {
            if (!uri || typeof uri !== 'string') return 'unknown';
            try {
                let s = uri.replace(/^[^:]+:\/\//, '');
                if (s.includes('@')) s = s.split('@').pop();
                s = s.split('/')[0];
                return s;
            } catch (err) {
                return 'unknown';
            }
        }

        if (fs.existsSync(logPath)) {
            const raw = fs.readFileSync(logPath, 'utf8').trim();
            if (!raw) return res.json({ status: 'no-entries' });
            const lines = raw.split(/\r?\n/).filter(Boolean);
            const last = lines[lines.length - 1];
            try {
                const parsed = JSON.parse(last);
                return res.json({ status: 'ok', startup: parsed });
            } catch (err) {
                // If the last line isn't valid JSON for some reason, return it raw
                return res.json({ status: 'ok', startupRaw: last });
            }
        } else {
            // Fallback summary when the log file doesn't exist yet
            const fallback = {
                timestamp: new Date().toISOString(),
                host: process.env.MONGODB_URI ? getDbHostFromUri(process.env.MONGODB_URI) : 'localhost',
                port: process.env.PORT || 5000,
                geminiKeyPresent: !!process.env.GEMINI_API_KEY
            };
            return res.json({ status: 'no-log', startup: fallback });
        }
    } catch (err) {
        console.error('Error in /api/status:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});