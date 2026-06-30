const crypto = require('crypto');

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
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

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { email, password } = body || {};

    if (!email || !password) {
      return sendError(res, 400, 'Email and password are required');
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const defaultAdminEmail = 'admin@bustracker.dev';
    const defaultAdminPass = 'admin123';

    if (normalizedEmail === defaultAdminEmail && password === defaultAdminPass) {
      const sessionToken = createSessionToken({
        id: 1,
        email: defaultAdminEmail,
        name: 'Fleet Administrator',
        role: 'admin',
      });

      res.setHeader('Set-Cookie', `__session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${14 * 24 * 60 * 60}`);
      return sendJson(res, 200, { status: 'success' });
    }

    return sendError(res, 401, 'Invalid email or password');
  } catch (error) {
    console.error('Session login error:', error);
    return sendError(res, 500, 'Internal server error during login');
  }
};
