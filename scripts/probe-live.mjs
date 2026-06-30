import https from 'https';
import http from 'http';

const base = 'https://jstu-bus-tracker.vercel.app';
const jar = {};

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const client = base.startsWith('https') ? https : http;
    const req = client.request(base + path, { method: options.method || 'GET', headers: options.headers || {} }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          for (const cookie of setCookie) {
            const [pair] = cookie.split(';');
            const [name, value] = pair.split('=');
            jar[name] = value;
          }
        }
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  const loginRes = await request('/api/session-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@bustracker.dev', password: 'admin123' }),
  });
  console.log('login', loginRes.status, loginRes.body);

  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const meRes = await request('/api/me', { headers: { Cookie: cookie } });
  console.log('me', meRes.status, meRes.body);

  const createRes = await request('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ email: `probe${Date.now()}@example.com`, name: 'Probe', role: 'driver', password: 'secret123' }),
  });
  console.log('create', createRes.status, createRes.body);

  const listRes = await request('/api/admin/users', { headers: { Cookie: cookie } });
  console.log('list', listRes.status, listRes.body);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
