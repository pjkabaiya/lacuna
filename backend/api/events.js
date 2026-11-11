const { getDb } = require('../lib/db');
const { isId, isLessonId, isStepId, rateLimit } = require('./common');

function validEvent(event) {
  if (!event || !isLessonId(event.lessonId) || !isStepId(event.stepId)) return false;
  if (Object.keys(event).some((key) => !['lessonId', 'stepId', 'type', 'correct', 'attempts', 'ms', 'option'].includes(key))) return false;
  if (!['choice', 'type', 'reveal', 'shown'].includes(event.type)) return false;
  if (['choice', 'type'].includes(event.type) && typeof event.correct !== 'boolean') return false;
  if (!Number.isInteger(event.attempts) || event.attempts < 0 || event.attempts > 1000) return false;
  if (!Number.isInteger(event.ms) || event.ms < 0 || event.ms > 3600000) return false;
  if (event.option !== undefined && (!Number.isInteger(event.option) || event.option < 0 || event.option > 20)) return false;
  return true;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    if (!await rateLimit(req)) return res.status(429).json({ error: 'rate_limited' });
    const body = req.body || {};
    if (!isId(body.learnerId)) return res.status(400).json({ error: 'invalid_learner_id' });
    if (!Array.isArray(body.events) || body.events.length > 50 || !body.events.every(validEvent)) {
      return res.status(400).json({ error: 'invalid_events' });
    }
    if (!body.events.length) return res.status(400).json({ error: 'empty_events' });

    const db = await getDb();
    const learnerCollection = db.collection('learners');
    const now = new Date();
    await learnerCollection.updateOne(
      { _id: body.learnerId },
      { $setOnInsert: { createdAt: now }, $set: { lastSeen: now } },
      { upsert: true },
    );

    const operations = body.events.map((event) => {
      const increments = {};
      if (event.type === 'choice') {
        increments[event.correct ? 'correctChoice' : 'wrongChoice'] = 1;
        if (!event.correct && Number.isInteger(event.option)) {
          increments[`byOption.option_${event.option}`] = 1;
        }
      } else if (event.type === 'type' && !event.correct) {
        increments.typeFails = 1;
      } else if (event.type === 'reveal') {
        increments.revealUsed = 1;
      } else if (event.type === 'shown') {
        increments.shown = 1;
      }
      if (!Object.keys(increments).length) return null;
      return {
        updateOne: {
          filter: { lessonId: event.lessonId, stepId: event.stepId },
          update: {
            $setOnInsert: { lessonId: event.lessonId, stepId: event.stepId },
            $inc: increments,
          },
          upsert: true,
        },
      };
    }).filter(Boolean);

    if (operations.length) await db.collection('stepStats').bulkWrite(operations, { ordered: false });
    return res.status(202).json({ ok: true, accepted: body.events.length });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'server_error' });
  }
};
