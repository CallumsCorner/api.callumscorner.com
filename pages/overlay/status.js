const cors = require('../../lib/cors');
const WebSocket = require('ws');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // check if there's an active overlay WebSocket connection
  const wss = global.wss;
  let overlayConnected = false;

  if (wss) {
    wss.clients.forEach((client) => {
      if (client.isOverlay && client.readyState === WebSocket.OPEN) {
        overlayConnected = true;
      }
    });
  }

  res.status(200).json({
    overlayConnected,
    timestamp: Date.now()
  });
}

module.exports = cors(handler);
