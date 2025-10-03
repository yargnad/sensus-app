require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const path = require('path');
const fs = require('fs');
const https = require('https');
const selfsigned = require('selfsigned');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// DB Config
// In development prefer a local DB to avoid accidentally using a cloud DB even when
// MONGODB_URI is present. Use LOCAL_MONGODB_URI to override the default local address.
let db;
if (process.env.NODE_ENV === 'development') {
    db = process.env.LOCAL_MONGODB_URI || 'mongodb://localhost:27017/sensus';
    console.log('NODE_ENV=development — preferring local MongoDB (set LOCAL_MONGODB_URI to override).');
} else {
    // In non-development (staging/production) prefer the explicit MONGODB_URI, fallback to localhost
    db = process.env.MONGODB_URI || 'mongodb://localhost:27017/sensus';
}

// Helper: extract host portion from a MongoDB URI without exposing credentials
function getDbHost(uri) {
    if (!uri || typeof uri !== 'string') return 'unknown';
    try {
        // Remove protocol (e.g. 'mongodb://' or 'mongodb+srv://')
        let s = uri.replace(/^[^:]+:\/\//, '');
        // If credentials are present, strip them (user:pass@)
        if (s.includes('@')) s = s.split('@').pop();
        // Host is the part before the first '/'
        s = s.split('/')[0];
        return s;
    } catch (err) {
        return 'unknown';
    }
}

// Write a short, non-sensitive JSON line to server/.startup.log for debugging.
function writeStartupLog(entry) {
    try {
        const logPath = path.join(__dirname, '.startup.log');
        const base = {
            timestamp: new Date().toISOString(),
            host: getDbHost(db),
            port: PORT
        };
        const safeEntry = Object.assign(base, entry);
        fs.appendFileSync(logPath, JSON.stringify(safeEntry) + '\n', { encoding: 'utf8' });
    } catch (err) {
        // Don't throw on logging failures
        console.error('Failed to write startup log:', err.message);
    }
}

// Check for Gemini API Key
// Log a non-sensitive summary about the Gemini API key (presence and length only).
if (process.env.GEMINI_API_KEY) {
    const keyLen = process.env.GEMINI_API_KEY.length;
    console.log(`Gemini API Key: present (length ${keyLen} characters)`);
    writeStartupLog({ geminiKeyPresent: true, geminiKeyLength: keyLen });
} else {
    console.error('FATAL ERROR: GEMINI_API_KEY not found in .env file.');
    writeStartupLog({ geminiKeyPresent: false });
}

// Connect to MongoDB
mongoose
    .connect(db)
    .then(() => {
        console.log(`MongoDB Connected to ${getDbHost(db)}`);
        writeStartupLog({ mongoConnected: true });
    })
    .catch(err => console.log(err));

// Use Routes
app.use('/api', apiRoutes);

// Serve static assets if in production
if (process.env.NODE_ENV === 'production') {
    // Set static folder
    app.use(express.static(path.join(__dirname, '../client/build')));

    app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, '../client/build', 'index.html'));
    });
}

app.listen(PORT, '0.0.0.0', () => console.log(`Server started on port ${PORT}`));
