import crypto from 'crypto';

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

export default (req, res) => {
  console.log('=== LOGIN HANDLER START ===');
  console.log('Method:', req.method);
  console.log('Body type:', typeof req.body);
  console.log('Body:', typeof req.body === 'object' ? JSON.stringify(req.body) : req.body);
  
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  try {
    // Try to get body - Vercel pre-parses JSON for us
    let body = req.body;
    
    if (typeof body === 'string') {
      body = JSON.parse(body);
    } else if (!body || typeof body !== 'object') {
      return sendError(res, 400, 'Invalid request body');
    }

    const { email, password } = body;
    console.log('Parsed email:', email);
    console.log('Parsed password:', password ? 'YES' : 'NO');

    if (!email || !password) {
      return sendError(res, 400, 'Email and password are required');
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const defaultAdminEmail = 'admin@bustracker.dev';
    const defaultAdminPass = 'admin123';

    console.log('Comparing:', normalizedEmail, 'vs', defaultAdminEmail);

    if (normalizedEmail === defaultAdminEmail && password === defaultAdminPass) {
      console.log('LOGIN SUCCESSFUL');
      const sessionToken = createSessionToken({
        id: 1,
        email: defaultAdminEmail,
        name: 'Fleet Administrator',
        role: 'admin',
      });

      res.setHeader('Set-Cookie', `__session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${14 * 24 * 60 * 60}`);
      return sendJson(res, 200, { status: 'success' });
    }

    console.log('LOGIN FAILED - invalid credentials');
    return sendError(res, 401, 'Invalid email or password');
  } catch (error) {
    console.error('=== LOGIN ERROR ===');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    return sendError(res, 500, `Internal server error: ${error.message}`);
  }
};


