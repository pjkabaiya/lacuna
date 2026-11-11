const { getDb } = require('../lib/db');
const { isId, isLessonId, rateLimit } = require('./common');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const learnerId = req.query.learnerId;
      if (!isId(learnerId)) return res.status(400).json({ error: 'invalid_learner_id' });
      const docs = await (await getDb()).collection('progress')
        .find({ learnerId }).toArray();
      const lessons = {};
      docs.forEach((doc) => {
        lessons[doc.lessonId] = {
          stepIndex: doc.stepIndex,
          completed: doc.completed,
          completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
          mistakes: doc.mistakes || 0,
        };
      });
      return res.status(200).json({ lessons });
    }

    if (req.method === 'POST') {
      if (!await rateLimit(req)) return res.status(429).json({ error: 'rate_limited' });
      const body = req.body || {};
      if (Object.keys(body).some((key) => !['learnerId', 'lessonId', 'stepIndex', 'completed', 'mistakes'].includes(key))) {
        return res.status(400).json({ error: 'unexpected_field' });
      }
      if (!isId(body.learnerId)) return res.status(400).json({ error: 'invalid_learner_id' });
      if (!isLessonId(body.lessonId)) return res.status(400).json({ error: 'invalid_lesson_id' });
      if (!Number.isInteger(body.stepIndex) || body.stepIndex < 0 || body.stepIndex > 1000) {
        return res.status(400).json({ error: 'invalid_step_index' });
      }
      if (typeof body.completed !== 'boolean') return res.status(400).json({ error: 'invalid_completed' });
      const mistakes = body.mistakes === undefined ? 0 : body.mistakes;
      if (!Number.isInteger(mistakes) || mistakes < 0 || mistakes > 100000) {
        return res.status(400).json({ error: 'invalid_mistakes' });
      }

      const db = await getDb();
      const now = new Date();
      const update = {
        $max: { stepIndex: body.stepIndex, mistakes },
        $setOnInsert: {
          learnerId: body.learnerId,
          lessonId: body.lessonId,
          createdAt: now,
        },
      };
      if (body.completed) {
        update.$set = { completed: true };
        update.$min = { completedAt: now };
      } else {
        update.$setOnInsert.completed = false;
      }
      await db.collection('progress').updateOne(
        { learnerId: body.learnerId, lessonId: body.lessonId },
        update,
        { upsert: true },
      );
      await db.collection('learners').updateOne(
        { _id: body.learnerId },
        { $setOnInsert: { createdAt: now }, $set: { lastSeen: now } },
        { upsert: true },
      );
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'server_error' });
  }
};
