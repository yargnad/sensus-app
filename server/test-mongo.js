const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGODB_URI || process.argv[2];
  if (!uri) {
    console.error('Missing MONGODB_URI. Set the env var or pass as the first arg.');
    process.exit(2);
  }

  // Print a sanitized host for debugging (no credentials)
  try {
    const host = uri.replace(/^(mongodb(\+srv)?:\/\/)(?:[^@]*@)?/, '$1*****@');
    console.log('Connecting with sanitized URI:', host);
  } catch (err) {
    console.log('Sanitized host: (error computing)');
  }

  try {
    await mongoose.connect(uri, { connectTimeoutMS: 10000, serverSelectionTimeoutMS: 10000 });
    const res = await mongoose.connection.db.admin().ping();
    console.log('Ping OK:', res);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Connection error:');
    console.error(err && err.message ? err.message : err);
    // Print more detailed error stack to help debugging (no secrets)
    if (err && err.stack) console.error(err.stack);
    process.exit(3);
  }
}

main();
require('dotenv').config();
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sensus';

mongoose.connect(uri, { maxPoolSize: 5 })
  .then(() => {
    console.log('MongoOK');
    return mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoErr', err.message);
    process.exit(1);
  });
