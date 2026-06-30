const crypto = require('crypto');

const parseJsonBody = async (req) => {
  if (req.body !== undefined) {
    if (typeof req.body === 'object' && req.body !== null) {
      return req.body;
    }

    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }

    if (Buffer.isBuffer(req.body)) {
      const raw = req.body.toString('utf8').trim();
      if (!raw) return {};
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
  }

  const chunks = [];
  for await (const chunk of req) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(chunk);
    }
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const sendJson = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(body);
};

const sendError = (res, status, error) => sendJson(res, status, { error });

const createSessionToken = (payload) => {
  const SESSION_SECRET = process.env.SESSION_SECRET || 'fallback-super-secret-bustracker-2026-auth';
  const key = crypto.scryptSync(SESSION_SECRET, 'salt', 32);
  const iv = Buffer.alloc(16, 0);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  const { email, password } = await parseJsonBody(req);
  if (!email || !password) {
    return sendError(res, 400, 'Email and password are required');
  }

  try {
    const normalizedEmail = String(email).toLowerCase().trim();
    const defaultAdminEmail = 'admin@bustracker.dev';
    const defaultAdminPass = 'admin123';

    console.log('LOGIN_REQUEST', { normalizedEmail, passwordProvided: Boolean(password) });

    if (normalizedEmail === defaultAdminEmail && password === defaultAdminPass) {
      console.log('LOGIN_SUCCESS_ADMIN');
      const sessionToken = createSessionToken({
        id: 1,
        email: defaultAdminEmail,
        name: 'Fleet Administrator',
        role: 'admin',
      });

      res.setHeader('Set-Cookie', \__session=\; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=\\);
      return sendJson(res, 200, { status: 'success' });
    }

    console.log('LOGIN_REJECTED');
    return sendError(res, 401, 'Invalid email or password');
  } catch (error) {
    console.error('Session login error:', error);
    return sendError(res, 500, 'Internal server error during login');
  }
};
