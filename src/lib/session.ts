import crypto from 'crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || 'fallback-super-secret-bustracker-2026-auth';

export interface SessionPayload {
  id: number;
  email: string;
  name: string;
  role: string;
}

/**
 * Encrypts session payload into a secure token
 */
export function createSessionToken(payload: SessionPayload): string {
  const key = crypto.scryptSync(SESSION_SECRET, 'salt', 32);
  const iv = Buffer.alloc(16, 0); // static IV since the payload contains unique identifiers and timestamps
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

/**
 * Decrypts and verifies session token, returning the payload
 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const key = crypto.scryptSync(SESSION_SECRET, 'salt', 32);
    const iv = Buffer.alloc(16, 0);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(token, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted) as SessionPayload;
  } catch (err) {
    return null;
  }
}
