const express = require('express');

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/healthz', (req, res) => res.status(200).send('ok'));
app.all('/api/quotes', require('./api/quotes'));
app.all('/api/ping', require('./api/ping'));
app.all('/api/admin', require('./api/admin'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on port ${port}`));
