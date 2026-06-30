export default (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    totalBuses: 0,
    totalDrivers: 0,
    runningBuses: 0,
    assignments: []
  }));
};
