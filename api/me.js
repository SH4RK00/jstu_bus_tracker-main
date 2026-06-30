require('dotenv').config();

const { parse } = require('cookie');
const { eq } = require('drizzle-orm');
const { db } = require('../src/db/index.ts');
const { users } = require('../src/db/schema.ts');
const { verifySessionToken } = require('../src/lib/session.ts');

const sendJson = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(body);
};

const sendError = (res, status, error) => sendJson(res, status, { error });

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

  try {
    const dbUser = await db.select().from(users).where(eq(users.id, decoded.id)).limit(1);
    if (dbUser.length === 0) {
      return sendError(res, 401, 'Unauthorized: User not found');
    }

    const user = dbUser[0];
    return sendJson(res, 200, {
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Me endpoint error:', error);
    return sendError(res, 500, 'Internal server error');
  }
};
