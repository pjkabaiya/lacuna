const { MongoClient } = require('mongodb');
let clientPromise;
let indexPromise;

async function getDb() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  if (!clientPromise) {
    clientPromise = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5 }).connect()
      .catch((error) => {
        clientPromise = undefined;
        throw error;
      });
  }
  const client = await clientPromise;
  const db = client.db(process.env.DB_NAME || 'lacuna');
  if (!indexPromise) {
    indexPromise = Promise.all([
      db.collection('progress').createIndex({ learnerId: 1, lessonId: 1 }, { unique: true }),
      db.collection('stepStats').createIndex({ lessonId: 1, stepId: 1 }, { unique: true }),
      db.collection('ratelimits').createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 }),
      db.collection('learners').createIndex({ lastSeen: 1 }),
    ]).catch((error) => {
      indexPromise = undefined;
      throw error;
    });
  }
  await indexPromise;
  return db;
}
module.exports = { getDb };
