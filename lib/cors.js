// cors.js
const { URL } = require('url');

function cors(handler) {
  return async (req, res) => {
    const origin = req.headers.origin || '';

    // Allowed explicit origins
    const allowedOrigins = [
      'https://donate.callumscorner.com',
      'https://admin.callumscorner.com',
      'https://queue.callumscorner.com',
      'https://refund.callumscorner.com',
      'https://api.callumscorner.com',
      'https://SECRETAPIBYPASSSUBDOMAIN.api.callumscorner.com',
      'https://rewind.callumscorner.com',
      "https://ayupifyourereadingthisonstream.callumscorner.com",
      'https://callumscorner.com',
      'http://localhost:3000' // dev
    ];

    // Preflight OPTIONS always ends here
    if (req.method === 'OPTIONS') {
      console.log('Preflight OPTIONS handled for origin:', origin);
      return res.status(200).end();
    }

    // Continue to actual route handler
    return handler(req, res);
  };
}

module.exports = cors;
