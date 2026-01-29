module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`<!DOCTYPE html>
<html>
<head>
<title>API</title>
</head>
<body>
Callum's Corner API Server is running. If you are seeing this page then either something went wrong and you were sent here by mistake by my system, or you are exploring the various subdomains of callumscorner.com - elloooo!
</body>
</html>`);
}
