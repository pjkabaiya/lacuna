const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

process.env.ADMIN_KEY = 'test-admin-key';
process.env.IP_SALT = 'test-only-salt';
process.env.CORS_ORIGIN = 'https://app.example';

const stores = {
  progress: new Map(),
  learners: new Map(),
  ratelimits: new Map(),
  stepStats: new Map(),
};

function matches(document, filter) {
  return Object.entries(filter).every(([key, value]) => document[key] === value);
}

function collection(name) {
  const store = stores[name];
  return {
    async createIndex() {},
    find(filter = {}) {
      return {
        async toArray() {
          return [...store.values()].filter((document) => matches(document, filter));
        },
      };
    },
    async countDocuments() {
      return store.size;
    },
    async updateOne(filter, update, options = {}) {
      const current = [...store.values()].find((document) => matches(document, filter));
      const document = current || (options.upsert ? { ...filter } : null);
      if (!document) return { matchedCount: 0 };
      if (!current && update.$setOnInsert) Object.assign(document, update.$setOnInsert);
      if (update.$set) Object.assign(document, update.$set);
      if (update.$max) {
        Object.entries(update.$max).forEach(([key, value]) => {
          if (document[key] === undefined || document[key] < value) document[key] = value;
        });
      }
      if (update.$min) {
        Object.entries(update.$min).forEach(([key, value]) => {
          if (document[key] === undefined || document[key] > value) document[key] = value;
        });
      }
      store.set(name === 'learners' ? document._id : `${document.learnerId}:${document.lessonId || document.stepId}`, document);
      return { matchedCount: current ? 1 : 0, upsertedCount: current ? 0 : 1 };
    },
    async findOneAndUpdate(filter, update) {
      const key = filter._id;
      const document = store.get(key) || { ...filter };
      if (update.$setOnInsert && !store.has(key)) Object.assign(document, update.$setOnInsert);
      if (update.$inc) {
        Object.entries(update.$inc).forEach(([field, amount]) => {
          document[field] = (document[field] || 0) + amount;
        });
      }
      store.set(key, document);
      return document;
    },
    async bulkWrite(operations) {
      operations.forEach(({ updateOne }) => {
        const { filter, update } = updateOne;
        const key = `${filter.lessonId}:${filter.stepId}`;
        const document = store.get(key) || { ...filter };
        if (!store.has(key) && update.$setOnInsert) Object.assign(document, update.$setOnInsert);
        Object.entries(update.$inc).forEach(([path, amount]) => {
          const parts = path.split('.');
          let target = document;
          while (parts.length > 1) {
            const part = parts.shift();
            target[part] = target[part] || {};
            target = target[part];
          }
          const field = parts[0];
          target[field] = (target[field] || 0) + amount;
        });
        store.set(key, document);
      });
    },
    aggregate() {
      return {
        async toArray() {
          const grouped = new Map();
          for (const document of store.values()) {
            const entry = grouped.get(document.lessonId) || { _id: document.lessonId, learners: 0, completed: 0 };
            entry.learners += 1;
            if (document.completed) entry.completed += 1;
            grouped.set(document.lessonId, entry);
          }
          return [...grouped.values()];
        },
      };
    },
  };
}

const fakeDb = { collection };
const dbPath = require.resolve('../lib/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { getDb: async () => fakeDb },
};
const app = require('../server');

let server;
let baseUrl;
test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function json(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  return { response, data: await response.json() };
}

test('health and CORS respond without connecting to MongoDB', async () => {
  const response = await fetch(`${baseUrl}/healthz`, { headers: { Origin: 'https://app.example' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://app.example');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const missing = await json('/api/not-a-route');
  assert.equal(missing.response.status, 404);
  assert.equal(missing.data.error, 'not_found');
});

test('malformed and oversized JSON bodies return consistent errors', async () => {
  const malformed = await fetch(`${baseUrl}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{broken',
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: 'invalid_json' });

  const oversized = await fetch(`${baseUrl}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ padding: 'x'.repeat(12000) }),
  });
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { error: 'request_too_large' });
});

test('progress is validated and only moves forward', async () => {
  const learnerId = 'l_123456789012345678901234';
  const first = await json('/api/progress', {
    method: 'POST',
    body: JSON.stringify({ learnerId, lessonId: 'py-01-first-print', stepIndex: 2, completed: false, mistakes: 3 }),
  });
  assert.equal(first.response.status, 200);

  const backwards = await json('/api/progress', {
    method: 'POST',
    body: JSON.stringify({ learnerId, lessonId: 'py-01-first-print', stepIndex: 0, completed: false, mistakes: 1 }),
  });
  assert.equal(backwards.response.status, 200);

  const completed = await json('/api/progress', {
    method: 'POST',
    body: JSON.stringify({ learnerId, lessonId: 'py-01-first-print', stepIndex: 6, completed: true, mistakes: 4 }),
  });
  assert.equal(completed.response.status, 200);

  const response = await json(`/api/progress?learnerId=${learnerId}`);
  assert.equal(response.response.status, 200);
  assert.equal(response.data.lessons['py-01-first-print'].stepIndex, 6);
  assert.equal(response.data.lessons['py-01-first-print'].completed, true);
  assert.equal(response.data.lessons['py-01-first-print'].mistakes, 4);

  const invalid = await json('/api/progress?learnerId=bad');
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.data.error, 'invalid_learner_id');
});

test('events aggregate choices, typing failures, and answer reveals', async () => {
  const learnerId = 'l_987654321098765432109876';
  const result = await json('/api/events', {
    method: 'POST',
    body: JSON.stringify({
      learnerId,
      events: [
        { lessonId: 'py-01-first-print', stepId: 'hello-text', type: 'shown', attempts: 0, ms: 0 },
        { lessonId: 'py-01-first-print', stepId: 'hello-text', type: 'choice', correct: false, option: 1, attempts: 1, ms: 500 },
        { lessonId: 'py-01-first-print', stepId: 'hello-text', type: 'choice', correct: true, option: 0, attempts: 2, ms: 900 },
        { lessonId: 'py-01-first-print', stepId: 'hello-text', type: 'type', correct: false, attempts: 1, ms: 1200 },
        { lessonId: 'py-01-first-print', stepId: 'hello-text', type: 'reveal', correct: false, attempts: 2, ms: 1500 },
      ],
    }),
  });
  assert.equal(result.response.status, 202);
  const stats = stores.stepStats.get('py-01-first-print:hello-text');
  assert.equal(stats.shown, 1);
  assert.equal(stats.wrongChoice, 1);
  assert.equal(stats.correctChoice, 1);
  assert.equal(stats.byOption.option_1, 1);
  assert.equal(stats.typeFails, 1);
  assert.equal(stats.revealUsed, 1);

  const tooMany = await json('/api/events', {
    method: 'POST',
    body: JSON.stringify({ learnerId, events: Array.from({ length: 51 }, () => ({})) }),
  });
  assert.equal(tooMany.response.status, 400);
  assert.equal(tooMany.data.error, 'invalid_events');
});

test('admin stats require the key and expose aggregate-only results', async () => {
  const denied = await json('/api/admin?view=stats');
  assert.equal(denied.response.status, 401);
  const allowed = await json('/api/admin?view=stats', { headers: { 'x-admin-key': 'test-admin-key' } });
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.data.uniqueLearners, 2);
  assert.equal(allowed.data.hardestSteps[0].wrongOptions[0].option, 1);
  assert.equal(allowed.data.lessons[0].completionRate, 1);
});
