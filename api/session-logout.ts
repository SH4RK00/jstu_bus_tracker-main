import * as dotenv from 'dotenv';

dotenv.config();

const sendJson = (res: any, status: number, payload: unknown) => {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(body);
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
    }

  res.setHeader('Set-Cookie', '__session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0');
  return sendJson(res, 200, { status: 'success' });
}
