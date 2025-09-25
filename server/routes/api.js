const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');
const Submission = require('../models/Submission');

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

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
const GEMINI_VISION_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;


async function getEmotionalVector(submission) {
// ... existing code ...
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
            // Placeholder for audio - Gemini API for audio is more complex
            // For now, we'll return a generic vector
            console.log('Audio analysis not yet implemented, returning generic vector.');
            return ['neutral'];
        }

        const response = await axios.post(apiUrl, requestBody);
        const summary = response.data.candidates[0].content.parts[0].text;
        return summary.split(',').map(kw => kw.trim().toLowerCase());

    } catch (error) {
        console.error('Error calling Gemini API:', error.response ? error.response.data : error.message);
        // Return a generic vector on error to avoid breaking the matching logic
        return ['error'];
    }
}


async function findAndPairMatch(submission) {
    // Atomically find a suitable unmatched submission and update it to prevent race conditions.
    // This operation finds a document and updates it in a single atomic step.
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const match = await Submission.findOneAndUpdate(
        {
            // Find criteria
            status: 'unmatched',
            _id: { $ne: submission._id },
            createdAt: { $gte: fiveMinutesAgo },
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
            sort: { createdAt: 'desc' } // Find the most recent match
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