require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// DB Config
const db = 'mongodb://localhost:27017/sensus'; // Replace with your MongoDB connection string

// Check for Gemini API Key
if (process.env.GEMINI_API_KEY) {
    console.log('Gemini API Key loaded successfully.');
} else {
    console.error('FATAL ERROR: GEMINI_API_KEY not found in .env file.');
}

// Connect to MongoDB
mongoose
    .connect(db)
    .then(() => console.log('MongoDB Connected...'))
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