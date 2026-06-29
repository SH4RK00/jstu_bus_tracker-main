import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as dotenv from 'dotenv';
import { eq } from 'drizzle-orm';

import { db, ensureDatabaseSchema } from '../src/db/index.ts';
import { users } from '../src/db/schema.ts';
import { hashPassword, verifyPassword } from '../src/lib/password.ts';
import { createSessionToken } from '../src/lib/session.ts';

dotenv.config();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await ensureDatabaseSchema();

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const normalizedEmail = String(email).toLowerCase().trim();
    let dbUser = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if (dbUser.length === 0) {
      const totalUsers = await db.select().from(users).limit(1);
      if (totalUsers.length === 0 && normalizedEmail === 'admin@bustracker.dev') {
        const hashedPassword = hashPassword(password);
        const inserted = await db.insert(users).values({
          email: normalizedEmail,
          name: 'Fleet Administrator',
          password: hashedPassword,
          role: 'admin',
          uid: 'admin_local',
        }).returning();
        dbUser = inserted;
      } else {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
    }

    const userRecord = dbUser[0];
    const isValid = verifyPassword(password, userRecord.password || '');
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const sessionToken = createSessionToken({
      id: userRecord.id,
      email: userRecord.email,
      name: userRecord.name,
      role: userRecord.role,
    });

    res.setHeader('Set-Cookie', `__session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${14 * 24 * 60 * 60}`);
    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Session login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
}
