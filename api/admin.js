// Moderation. Send header  x-admin-key: <ADMIN_KEY>
// GET  /api/admin?status=pending            -> list quotes by status
// POST /api/admin {id, action:"approve"|"delete"}
const { ObjectId } = require('mongodb');
const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.ADMIN_KEY || req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const quotes = (await getDb()).collection('quotes');
    if (req.method === 'GET') {
      const status = req.query.status === 'approved' ? 'approved' : 'pending';
      const docs = await quotes.find({ status }).sort({ createdAt: -1 }).limit(100).toArray();
      return res.status(200).json({ quotes: docs });
    }
    if (req.method === 'POST') {
      const { id, action } = req.body || {};
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'bad_id' });
      const _id = new ObjectId(id);
      if (action === 'approve') await quotes.updateOne({ _id }, { $set: { status: 'approved' } });
      else if (action === 'delete') await quotes.deleteOne({ _id });
      else return res.status(400).json({ error: 'bad_action' });
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
};
