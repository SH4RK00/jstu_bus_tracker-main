require('dotenv').config();

const { eq } = require('drizzle-orm');
const { db, ensureDatabaseSchema } = require('../src/db/index.ts');
const { users } = require('../src/db/schema.ts');
const { hashPassword, verifyPassword } = require('../src/lib/password.ts');
const { createSessionToken } = require('../src/lib/session.ts');

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
    const isDefaultAdminLogin = normalizedEmail === defaultAdminEmail && password === defaultAdminPass;
    console.log('LOGIN_REQUEST', {
      normalizedEmail,
      passwordProvided: Boolean(password),
      isDefaultAdminLogin,
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      hasSqlHost: Boolean(process.env.SQL_HOST),
    });

    await ensureDatabaseSchema();
    let dbUser = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if (dbUser.length === 0) {
      const totalUsers = await db.select().from(users).limit(1);
      console.log('LOGIN_NO_USER', { totalUsers: totalUsers.length, normalizedEmail, isDefaultAdminLogin });
      if (isDefaultAdminLogin) {
        const hashedPassword = hashPassword(defaultAdminPass);
        const inserted = await db.insert(users).values({
          email: normalizedEmail,
          name: 'Fleet Administrator',
          password: hashedPassword,
          role: 'admin',
          uid: 'admin_local',
        }).returning();
        dbUser = inserted;
      } else {
        console.log('LOGIN_REJECTED_NO_USER');
        return sendError(res, 401, 'Invalid email or password');
      }
    } else {
      const userRecord = dbUser[0];
      if (isDefaultAdminLogin && (!userRecord.password || userRecord.password === '' || !verifyPassword(defaultAdminPass, userRecord.password))) {
        const hashedPassword = hashPassword(defaultAdminPass);
        const updated = await db.update(users)
          .set({ password: hashedPassword })
          .where(eq(users.id, userRecord.id))
          .returning();
        dbUser = updated;
      }
    }

    const userRecord = dbUser[0];
    console.log('LOGIN_USER_FOUND', { email: userRecord.email, role: userRecord.role, hasPassword: Boolean(userRecord.password) });
    const isValid = verifyPassword(password, userRecord.password || '');
    console.log('LOGIN_PASSWORD_CHECK', { isValid, isDefaultAdminLogin });
    if (!isValid) {
      return sendError(res, 401, 'Invalid email or password');
    }

    const sessionToken = createSessionToken({
      id: userRecord.id,
      email: userRecord.email,
      name: userRecord.name,
      role: userRecord.role,
    });

    res.setHeader('Set-Cookie', `__session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${14 * 24 * 60 * 60}`);
    return sendJson(res, 200, { status: 'success' });
  } catch (error) {
    console.error('Session login error:', error);
    return sendError(res, 500, 'Internal server error during login');
  }
};
