import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/admin/[...slug].js';

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = JSON.stringify(payload);
      this.setHeader('Content-Type', 'application/json');
      return this;
    },
    end(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('admin routes respond with JSON for dashboard requests', async () => {
  const req = { method: 'GET', url: '/api/admin/dashboard', headers: {} };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.match(res.body, /Unauthorized/i);
  assert.equal(res.headers['Content-Type'], 'application/json');
});

test('admin create-bus route returns JSON even without a session', async () => {
  const req = { method: 'POST', url: '/api/admin/buses', headers: {} };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.match(res.body, /Unauthorized/i);
  assert.equal(res.headers['Content-Type'], 'application/json');
});
