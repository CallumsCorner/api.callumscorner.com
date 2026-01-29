const { requireAuth } = require('../../../lib/auth');
const db = require('../../../lib/database');
const cors = require('../../../lib/cors');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.body;
    console.log('Request received for sound ID:', id);

    if (!id) {
      return res.status(400).json({ error: 'Sound ID is required' });
    }

    // Get sound info
    const sound = await db.getSoundboardSoundById(id);
    console.log('Sound found:', sound);

    if (!sound) {
      return res.status(404).json({ error: 'Sound not found' });
    }

    // Broadcast to all connected clients via WebSocket
    console.log('Broadcasting to clients, global.broadcastToClients exists:', !!global.broadcastToClients);

    if (global.broadcastToClients) {
      const message = {
        type: 'soundboard-play',
        soundId: sound.id,
        filename: sound.filename,
        timestamp: new Date().toISOString()
      };
      console.log('Broadcasting message:', message);
      global.broadcastToClients(message);
      console.log('Broadcast complete');
    } else {
      console.error('error: global.broadcastToClients is not defined! idiot');
    }

    res.status(200).json({
      success: true,
      message: 'Sound play command sent',
      sound: {
        id: sound.id,
        name: sound.name,
        filename: sound.filename
      }
    });

  } catch (error) {
    console.error('Soundboard play error:', error);
    res.status(500).json({ error: 'Failed to play sound' });
  }
}

module.exports = cors(requireAuth(handler));
