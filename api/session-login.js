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

// Parse request body from stream with timeout
const parseBody = (req) => {
  return new Promise((resolve) => {
    let data = '';
    let timeoutId;
    
    try {
      timeoutId = setTimeout(() => {
        console.log('parseBody timeout - no data received');
        resolve({});
      }, 5000);
      
      req.on('data', chunk => {
        data += chunk;
      });
      
      req.on('end', () => {
        clearTimeout(timeoutId);
        try {
          const parsed = data ? JSON.parse(data) : {};
          console.log('parseBody success:', { received: !!data, length: data.length });
          resolve(parsed);
        } catch (e) {
          console.log('parseBody JSON error:', e.message);
          resolve({});
        }
      });
      
      req.on('error', (err) => {
        clearTimeout(timeoutId);
        console.log('parseBody stream error:', err.message);
        resolve({});
      });
    } catch (e) {
      console.log('parseBody setup error:', e.message);
      clearTimeout(timeoutId);
      resolve({});
    }
  });
};

module.exports = async (req, res) => {
  console.log('session-login: handler started', { method: req.method });
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method !== 'POST') {
    console.log('session-login: wrong method');
    return sendError(res, 405, 'Method not allowed');
  }

  try {
    console.log('session-login: parsing body');
    const body = await parseBody(req);
    console.log('session-login: body parsed', { email: body?.email, hasPassword: !!body?.password });
    
    const { email, password } = body;

    if (!email || !password) {
      console.log('session-login: missing credentials');
      return sendError(res, 400, 'Email and password are required');
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    console.log('session-login: checking credentials', { normalizedEmail });
    
    const defaultAdminEmail = 'admin@bustracker.dev';
    const defaultAdminPass = 'admin123';

    if (normalizedEmail === defaultAdminEmail && password === defaultAdminPass) {
      console.log('session-login: credentials valid, creating token');
      const sessionToken = createSessionToken({
        id: 1,
        email: defaultAdminEmail,
        name: 'Fleet Administrator',
        role: 'admin',
      });

      res.setHeader('Set-Cookie', `__session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${14 * 24 * 60 * 60}`);
      console.log('session-login: success');
      return sendJson(res, 200, { status: 'success' });
    }

    console.log('session-login: credentials invalid');
    return sendError(res, 401, 'Invalid email or password');
  } catch (error) {
    console.error('session-login: handler error', { message: error.message, stack: error.stack });
    return sendError(res, 500, 'Internal server error');
  }
};

