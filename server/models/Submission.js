const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Create Schema
const SubmissionSchema = new Schema({
    contentType: {
        type: String,
        required: true // 'text', 'image', 'audio'
    },
    content: {
        type: String, // For text content or file path
        required: true
    },
    emotionalVector: {
        type: [String],
        default: []
    },
    status: {
        type: String,
        default: 'unmatched' // 'unmatched', 'matching', 'matched'
    },
    matchedWith: {
        type: Schema.Types.ObjectId,
        ref: 'submissions',
        default: null
    },
    sessionToken: {
        type: String,
        required: true,
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = Submission = mongoose.model('submissions', SubmissionSchema);