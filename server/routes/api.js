const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');
const Submission = require('../models/Submission');
const path = require('path');
const { Storage } = require('@google-cloud/storage');

// Simple on-disk cache for emotional vectors to avoid redundant Gemini calls
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'emotional_vectors.json');
let vectorCache = {};
try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    if (fs.existsSync(CACHE_FILE)) {
        const raw = fs.readFileSync(CACHE_FILE, 'utf8');
        vectorCache = raw ? JSON.parse(raw) : {};
    }
} catch (e) {
    console.error('Error loading vector cache:', e.message);
    vectorCache = {};
}

function saveVectorCache() {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(vectorCache, null, 2));
    } catch (e) {
        console.error('Error writing vector cache:', e.message);
    }
}

// Basic in-memory per-IP rate limiter (small footprint, reset on restart)
const rateLimitWindowMs = 60 * 1000; // 1 minute
const maxRequestsPerWindow = 1; // limit to 1 request per window (safer)
const ipRequestTimestamps = new Map();

// Simple Gemini call logger (helps reconcile billing)
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'gemini_calls.log');
try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (e) {
    console.error('Failed to ensure log dir:', e.message);
}

function appendGeminiLog(entry) {
    try {
        const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
        fs.appendFileSync(LOG_FILE, line);
    } catch (e) {
        console.error('Failed to write gemini log:', e.message);
    }
}


// Initialize Cloud Storage
const storage = new Storage();
const bucketName = 'sensus-uploads';
const bucket = storage.bucket(bucketName);

// Multer config for file uploads (temporarily stores files in memory)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Allow overriding the model via environment variables for quick rollback/testing.
// Example: set GEMINI_MODEL=gemini-2.0-flash and GEMINI_VISION_MODEL=gemini-2.0-flash
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || GEMINI_MODEL;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
const GEMINI_VISION_API_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_VISION_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

async function getEmotionalVector(submission) {
    // Ensure we attempt the Gemini call at least once.
    // Setting this to 0 effectively disables any attempt (loop never runs),
    // which was preventing API calls — use 1 to try once and avoid retries.
    const maxRetries = 1; // try once, no automatic retries
    let attempt = 0;
    let delay = 5000; // Start with a 5-second delay

    // Quick exit if Gemini is disabled via environment (immediate mitigation)
    if (process.env.DISABLE_GEMINI === 'true') {
        console.log('DISABLE_GEMINI is true — returning cached/default vector');
        // If we have a cached vector for this content, return it
        try {
            const key = crypto.createHash('sha256').update(submission.content).digest('hex');
            if (vectorCache[key]) return vectorCache[key];
        } catch (e) {
            // fall through
        }
        return ['neutral'];
    }

    // Check cache first to avoid unnecessary API calls
    try {
        const key = crypto.createHash('sha256').update(submission.content).digest('hex');
        if (vectorCache[key]) {
            return vectorCache[key];
        }
    } catch (e) {
        // ignore cache errors and continue to call API
    }

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
                let imageBytes;
                
                // Check if it's a GCS URL or local file path
                if (submission.content.startsWith('https://storage.googleapis.com/')) {
                    // Download from GCS (this inflates network + payload size)
                    const response = await axios.get(submission.content, { responseType: 'arraybuffer' });
                    imageBytes = Buffer.from(response.data).toString('base64');
                } else {
                    // Read from local file (fallback for old uploads)
                    imageBytes = fs.readFileSync(submission.content).toString('base64');
                }
                
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

            // Log outgoing Gemini call (model/url, type, approximate payload bytes)
            try {
                const payloadSize = Buffer.byteLength(JSON.stringify(requestBody), 'utf8');
                appendGeminiLog({ event: 'request', url: apiUrl, contentType: submission.contentType, payloadBytes: payloadSize, attempt });
            } catch (e) {
                // ignore logging errors
            }

            const response = await axios.post(apiUrl, requestBody);
            const summary = response.data.candidates[0].content.parts[0].text;
            // Log response size/summary for reconciliation
            try {
                const respSize = Buffer.byteLength(JSON.stringify(response.data), 'utf8');
                appendGeminiLog({ event: 'response', url: apiUrl, contentType: submission.contentType, responseBytes: respSize, attempt });
            } catch (e) {
                // ignore logging errors
            }
            const vector = summary.split(',').map(kw => kw.trim().toLowerCase());
            // Cache result to disk
            try {
                const key = crypto.createHash('sha256').update(submission.content).digest('hex');
                vectorCache[key] = vector;
                saveVectorCache();
            } catch (e) {
                // ignore cache write errors
            }
            return vector;

        } catch (error) {
            const errorMessage = error.response ? (error.response.data.error ? error.response.data.error.message : error.response.data) : error.message;
            console.error(`Error on attempt ${attempt + 1}:`, errorMessage);

            // Log errors from Gemini for later reconciliation
            try { appendGeminiLog({ event: 'error', message: errorMessage, attempt }); } catch (e) {}

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
        // Simple per-IP rate limit to prevent runaway automated requests
        try {
            const ip = req.ip || req.connection.remoteAddress || 'unknown';
            const now = Date.now();
            const arr = ipRequestTimestamps.get(ip) || [];
            // keep timestamps within the window
            const cutoff = now - rateLimitWindowMs;
            const recent = arr.filter(t => t > cutoff);
            if (recent.length >= maxRequestsPerWindow) {
                return res.status(429).json({ msg: 'Too many requests from this IP — slow down.' });
            }
            recent.push(now);
            ipRequestTimestamps.set(ip, recent);
        } catch (e) {
            console.error('Rate limit check failed:', e.message);
        }

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
            // Upload file to Cloud Storage
            const filename = `${Date.now()}-${req.file.originalname}`;
            const blob = bucket.file(filename);
            
            const blobStream = blob.createWriteStream({
                resumable: false,
                metadata: {
                    contentType: req.file.mimetype,
                    cacheControl: 'public, max-age=31536000', // Cache for 1 year
                }
            });

            // Wrap the upload in a promise
            await new Promise((resolve, reject) => {
                blobStream.on('error', reject);
                blobStream.on('finish', resolve);
                blobStream.end(req.file.buffer);
            });

            // Get the public URL
            const publicUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;
            console.log(`File uploaded to GCS: ${publicUrl}, mimetype: ${req.file.mimetype}`);
            
            newSubmission = new Submission({
                contentType: req.file.mimetype.startsWith('image') ? 'image' : 'audio',
                content: publicUrl, // Store the GCS URL instead of file path
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

module.exports = router;