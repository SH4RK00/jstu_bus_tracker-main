require('dotenv').config();

const sendJson = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(body);
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  res.setHeader('Set-Cookie', '__session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0');
  return sendJson(res, 200, { status: 'success' });
};
