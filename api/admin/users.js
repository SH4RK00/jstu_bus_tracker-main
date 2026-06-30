export default (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'GET') {
    res.end(JSON.stringify([]));
  } else if (req.method === 'POST') {
    res.end(JSON.stringify({ 
      id: Math.random().toString(36).substr(2, 9),
      email: req.body?.email,
      name: req.body?.name,
      role: req.body?.role || 'user'
    }));
  } else {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
};
