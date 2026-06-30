export default (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'POST') {
    res.end(JSON.stringify({ 
      id: Math.random().toString(36).substr(2, 9),
      busId: req.body?.busId,
      driverId: req.body?.driverId
    }));
  } else {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
};
