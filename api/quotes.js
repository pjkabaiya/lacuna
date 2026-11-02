// GET  /api/quotes  -> latest approved community quotes
// POST /api/quotes  -> { name?, text } submit an anonymous quote
const crypto = require('crypto');
const { getDb } = require('../lib/db');

const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'porn', 'xxx', 'rape', 'kill yourself', 'http://', 'https://', 'www.'];
const MAX_PER_HOUR = 5;

const clean = (s) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim();
const randomName = () => 'Anon-' + (1000 + crypto.randomInt(9000));

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const db = await getDb();
    const quotes = db.collection('quotes');

    if (req.method === 'GET') {
      const docs = await quotes.find({ status: 'approved' }).sort({ createdAt: -1 }).limit(30).project({ name: 1, text: 1, createdAt: 1 }).toArray();
      return res.status(200).json({ quotes: docs.map((d) => ({ id: String(d._id), name: d.name, text: d.text, createdAt: d.createdAt })) });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const text = clean(body.text);
      let name = clean(body.name);
      if (!/^[A-Za-z0-9 _-]{2,20}$/.test(name)) name = randomName();
      if (text.length < 5 || text.length > 200) return res.status(400).json({ error: 'Quote must be 5 to 200 characters.' });
      const lower = (text + ' ' + name).toLowerCase();
      if (BLOCKED.some((w) => lower.includes(w))) return res.status(400).json({ error: 'Please keep it clean and link-free.' });

      // Rate limit by salted IP hash (the IP itself is never stored)
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      const h = crypto.createHash('sha256').update(ip + (process.env.IP_SALT || 'salt')).digest('hex');
      const limits = db.collection('ratelimits');
      const used = await limits.countDocuments({ h, createdAt: { $gte: new Date(Date.now() - 3600000) } });
      if (used >= MAX_PER_HOUR) return res.status(429).json({ error: 'Too many quotes. Try again later.' });
      await limits.insertOne({ h, createdAt: new Date() });

      const status = process.env.REQUIRE_APPROVAL === 'true' ? 'pending' : 'approved';
      await quotes.insertOne({ name, text, status, createdAt: new Date() });
      return res.status(201).json({ ok: true, status, name });
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
};
