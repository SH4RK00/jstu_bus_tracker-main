import { setTimeout as delay } from 'node:timers/promises';

const base = 'https://jstu-bus-tracker.vercel.app';
const jar = new Map();

async function request(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const cookieHeader = Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  if (cookieHeader) headers.cookie = cookieHeader;
  const res = await fetch(new URL(path, base), { ...opts, headers });
  const text = await res.text();
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const [pair] = setCookie.split(';');
    const [name, value] = pair.split('=');
    jar.set(name.trim(), value.trim());
  }
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

const login = await request('/api/session-login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@bustracker.dev', password: 'admin123' }),
});
console.log('LOGIN', login.status, JSON.stringify(login.body));

await delay(500);

const usersBefore = await request('/api/admin/users');
console.log('USERS BEFORE', usersBefore.status, JSON.stringify(usersBefore.body));

const createUser = await request('/api/admin/users', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'probe.user@example.com', name: 'Probe User', role: 'driver', password: 'secret123' }),
});
console.log('CREATE USER', createUser.status, JSON.stringify(createUser.body));

const usersAfter = await request('/api/admin/users');
console.log('USERS AFTER', usersAfter.status, JSON.stringify(usersAfter.body));

const createBus = await request('/api/admin/buses', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ busNumber: 'P999', name: 'Probe Bus', schedules: [{ routeFrom: 'A', routeTo: 'B', departureTime: '08:00', arrivalTime: '09:00' }] }),
});
console.log('CREATE BUS', createBus.status, JSON.stringify(createBus.body));

const busesAfter = await request('/api/admin/buses');
console.log('BUSES AFTER', busesAfter.status, JSON.stringify(busesAfter.body));
