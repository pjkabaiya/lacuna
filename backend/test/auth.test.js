const assert = require('node:assert/strict');
const test = require('node:test');
const { createAuthMiddleware } = require('../lib/auth');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('auth middleware requires a bearer token', async () => {
  const middleware = createAuthMiddleware(async () => ({ uid: 'user-1' }));
  const res = response();
  let continued = false;
  await middleware({ headers: {} }, res, () => { continued = true; });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'unauthorized' });
  assert.equal(continued, false);
});

test('auth middleware rejects invalid Firebase tokens', async () => {
  const invalidToken = Object.assign(new Error('expired'), { code: 'auth/id-token-expired' });
  const middleware = createAuthMiddleware(async () => { throw invalidToken; });
  const res = response();
  await middleware({ headers: { authorization: 'Bearer expired-token' } }, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'unauthorized' });
});

test('auth middleware attaches verified identity', async () => {
  const middleware = createAuthMiddleware(async (token) => ({ uid: `verified-${token}` }));
  const req = { headers: { authorization: 'Bearer opaque-token' } };
  const res = response();
  let continued = false;
  await middleware(req, res, () => { continued = true; });
  assert.equal(continued, true);
  assert.deepEqual(req.auth, { uid: 'verified-opaque-token' });
});
