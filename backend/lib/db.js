const { MongoClient } = require('mongodb');
let clientPromise;
let indexed = false;

async function getDb() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  if (!clientPromise) {
    clientPromise = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5 }).connect();
  }
  const client = await clientPromise;
  const db = client.db(process.env.DB_NAME || 'nonutnovember');
  if (!indexed) {
    indexed = true;
    await Promise.all([
      db.collection('presence').createIndex({ lastSeen: 1 }, { expireAfterSeconds: 120 }),
      db.collection('ratelimits').createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 }),
      db.collection('quotes').createIndex({ status: 1, createdAt: -1 }),
    ]).catch(() => {});
  }
  return db;
}
module.exports = { getDb };
