export default (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'GET') {
    res.end(JSON.stringify([]));
  } else if (req.method === 'POST') {
    res.end(JSON.stringify({ 
      id: Math.random().toString(36).substr(2, 9),
      busNumber: req.body?.busNumber,
      busName: req.body?.busName,
      schedules: req.body?.schedules || []
    }));
  } else {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
};
