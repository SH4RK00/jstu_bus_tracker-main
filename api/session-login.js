import crypto from 'crypto';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

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

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password, stored) => {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const checkHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === checkHash;
};

const createPool = () => {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.SQL_URL;
  const host = process.env.SQL_HOST || process.env.PGHOST || process.env.POSTGRES_HOST;
  const user = process.env.SQL_USER || process.env.PGUSER || process.env.POSTGRES_USER;
  const password = process.env.SQL_PASSWORD || process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD;
  const database = process.env.SQL_DB_NAME || process.env.PGDATABASE || process.env.POSTGRES_DB;
  const isNeon = (connectionString || host || '').includes('neon.tech');

  const poolConfig = {
    connectionTimeoutMillis: 15000,
    ssl: isNeon ? { rejectUnauthorized: false } : undefined,
  };

  return connectionString
    ? new Pool({ connectionString, ...poolConfig })
    : new Pool({ host, user, password, database, ...poolConfig });
};

const pool = createPool();
pool.on('error', (err) => {
  console.error('Unexpected idle client error in session-login pool:', err);
});

const ensureUsersTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.users (
      id serial PRIMARY KEY,
      uid text UNIQUE,
      email text NOT NULL UNIQUE,
      name text NOT NULL,
      password text DEFAULT '',
      role text NOT NULL DEFAULT 'user',
      created_at timestamp DEFAULT now()
    );
  `);
};

const parseRequestBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
};

export default async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  try {
    const body = await parseRequestBody(req);
    const { email, password } = body;

    if (!email || !password) {
      return sendError(res, 400, 'Email and password are required');
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const defaultAdminEmail = 'admin@bustracker.dev';
    const defaultAdminPass = 'admin123';

    await ensureUsersTable();

    const existingUser = await pool.query(
      'SELECT id, uid, email, name, role, password FROM public.users WHERE email = $1 LIMIT 1',
      [normalizedEmail],
    );

    let user = existingUser.rows[0];

    if (!user) {
      if (normalizedEmail !== defaultAdminEmail || password !== defaultAdminPass) {
        return sendError(res, 401, 'Invalid email or password');
      }

      const hashedPassword = hashPassword(defaultAdminPass);
      const inserted = await pool.query(
        `INSERT INTO public.users (email, name, role, password, uid) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, role`,
        [normalizedEmail, 'Fleet Administrator', 'admin', hashedPassword, 'admin_local'],
      );
      user = inserted.rows[0];
    }

    if (!verifyPassword(password, user.password || '')) {
      // Allow first-time admin login if admin row exists with empty password and default password is used.
      if (normalizedEmail === defaultAdminEmail && user.role === 'admin' && (!user.password || user.password === '')) {
        const hashedPassword = hashPassword(defaultAdminPass);
        await pool.query('UPDATE public.users SET password = $1 WHERE id = $2', [hashedPassword, user.id]);
      } else {
        return sendError(res, 401, 'Invalid email or password');
      }
    }

    const sessionToken = createSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    res.setHeader('Set-Cookie', `__session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${14 * 24 * 60 * 60}`);
    return sendJson(res, 200, { status: 'success' });
  } catch (error) {
    console.error('Session login error:', error);
    return sendError(res, 500, `Internal server error: ${error.message}`);
  }
};


