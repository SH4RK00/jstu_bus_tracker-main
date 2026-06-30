import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/driver/assigned-bus.js';

test('driver assigned-bus route resolves instead of returning 404', async () => {
  let statusCode = 200;
  let body = '';

  const req = {
    method: 'GET',
    url: '/api/driver/assigned-bus',
    headers: {},
  };

  const res = {
    statusCode: 200,
    setHeader() {},
    end(payload) {
      body = payload;
    },
  };

  await handler(req, res);

  assert.notEqual(res.statusCode, 404, 'driver route should not return 404');
  assert.match(String(body || ''), /Unauthorized|assigned|error/i);
});
