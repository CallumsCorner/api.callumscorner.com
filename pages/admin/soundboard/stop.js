const { requireAuth } = require('../../../lib/auth');
const cors = require('../../../lib/cors');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Broadcast stop command to overlay via WebSocket
    if (global.broadcastToClients) {
      global.broadcastToClients({
        type: 'soundboard-stop',
        timestamp: new Date().toISOString()
      });
    }

    res.status(200).json({
      success: true,
      message: 'Stop command sent to all clients'
    });

  } catch (error) {
    console.error('Soundboard stop error:', error);
    res.status(500).json({ error: 'Failed to send stop command' });
  }
}

module.exports = cors(requireAuth(handler));
