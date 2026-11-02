// Heartbeat: each open browser tab calls this every ~30s. Returns how many tabs were seen in the last 60s.
const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const db = await getDb();
    const col = db.collection('presence');
    const id = req.method === 'POST' && req.body && typeof req.body.id === 'string' ? req.body.id.slice(0, 40) : null;
    if (id && /^[a-zA-Z0-9_-]+$/.test(id)) {
      await col.updateOne({ _id: id }, { $set: { lastSeen: new Date() } }, { upsert: true });
    }
    const online = await col.countDocuments({ lastSeen: { $gte: new Date(Date.now() - 60000) } });
    res.status(200).json({ online });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
};
