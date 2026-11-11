const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.ADMIN_KEY || req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (req.query.view !== 'stats') return res.status(400).json({ error: 'invalid_view' });

  try {
    const db = await getDb();
    const [stats, lessonProgress, learnerCount] = await Promise.all([
      db.collection('stepStats').find({}).toArray(),
      db.collection('progress').aggregate([
        {
          $group: {
            _id: '$lessonId',
            learners: { $sum: 1 },
            completed: { $sum: { $cond: ['$completed', 1, 0] } },
          },
        },
      ]).toArray(),
      db.collection('learners').countDocuments(),
    ]);

    const steps = stats.map((step) => {
      const options = Object.entries(step.byOption || {})
        .map(([option, count]) => ({ option: Number(option.replace(/^option_/, '')), count }))
        .filter((entry) => Number.isInteger(entry.option) && entry.count > 0)
        .sort((a, b) => b.count - a.count);
      return {
        lessonId: step.lessonId,
        stepId: step.stepId,
        shown: step.shown || 0,
        correctChoice: step.correctChoice || 0,
        wrongChoice: step.wrongChoice || 0,
        typeFails: step.typeFails || 0,
        revealUsed: step.revealUsed || 0,
        wrongOptions: options,
      };
    });

    return res.status(200).json({
      uniqueLearners: learnerCount,
      lessons: lessonProgress.map((lesson) => ({
        lessonId: lesson._id,
        learners: lesson.learners,
        completed: lesson.completed,
        completionRate: lesson.learners ? lesson.completed / lesson.learners : 0,
      })),
      hardestSteps: [...steps].sort((a, b) => b.wrongChoice - a.wrongChoice).slice(0, 20),
      mostPickedWrongOptions: steps
        .flatMap((step) => step.wrongOptions
          .map((option) => ({ lessonId: step.lessonId, stepId: step.stepId, ...option })))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'server_error' });
  }
};
