const crypto = require('crypto');
const { parse } = require('cookie');

const sendJson = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(body);
};

const sendError = (res, status, error) => sendJson(res, status, { error });

const verifySessionToken = (token) => {
  try {
    const SESSION_SECRET = process.env.SESSION_SECRET || 'fallback-super-secret-bustracker-2026-auth';
    const key = crypto.scryptSync(SESSION_SECRET, 'salt', 32);
    const iv = Buffer.alloc(16, 0);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(token, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (err) {
    return null;
  }
};

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendError(res, 405, 'Method not allowed');
  }

  const cookies = req.headers?.cookie ? parse(req.headers.cookie) : {};
  const sessionToken = cookies.__session;
  if (!sessionToken) {
    return sendError(res, 401, 'Unauthorized: No session cookie');
  }

  const decoded = verifySessionToken(sessionToken);
  if (!decoded) {
    return sendError(res, 401, 'Unauthorized: Invalid session');
  }

  return sendJson(res, 200, {
    user: {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
    },
  });
};
