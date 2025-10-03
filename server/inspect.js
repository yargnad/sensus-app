const mongoose = require('mongoose');
const Submission = require('./models/Submission');

const db = 'mongodb://localhost:27017/sensus';

async function main() {
  await mongoose.connect(db);
  console.log('Connected to MongoDB');
  const docs = await Submission.find().sort({ createdAt: -1 }).limit(10).lean();
  docs.forEach(d => {
    console.log('---');
    console.log('id:', d._id);
    console.log('contentType:', d.contentType);
    console.log('content:', d.content);
    console.log('status:', d.status);
    console.log('emotionalVector:', d.emotionalVector);
    console.log('matchedWith:', d.matchedWith);
    console.log('createdAt:', d.createdAt);
  });
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
