const crypto = require('crypto');
const { getDb } = require('../lib/db');

const LESSON_PATTERN = /^[a-z0-9-]{1,80}$/;
const STEP_PATTERN = /^[a-z0-9-]{1,40}$/;

function isLessonId(value) {
  return typeof value === 'string' && LESSON_PATTERN.test(value);
}

function isStepId(value) {
  return typeof value === 'string' && STEP_PATTERN.test(value);
}

async function rateLimit(req) {
  const salt = process.env.IP_SALT;
  if (!salt) throw new Error('IP_SALT is not set');
  const ip = String(req.ip || req.socket.remoteAddress || '').slice(0, 100);
  const hash = crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex');
  const hour = Math.floor(Date.now() / 3600000);
  const db = await getDb();
  const key = `${hash}:${hour}`;
  const result = await db.collection('ratelimits').findOneAndUpdate(
    { _id: key },
    { $inc: { count: 1 }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true, returnDocument: 'after' },
  );
  return result.count <= 120;
}

module.exports = {
  isLessonId,
  isStepId,
  rateLimit,
};
