const { requireAuth } = require('../../../lib/auth');
const db = require('../../../lib/database');
const cors = require('../../../lib/cors');

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Get soundboard volume setting
      const soundboardVolume = await db.getSetting('soundboardVolume');

      res.status(200).json({
        soundboardVolume: parseFloat(soundboardVolume || '0.7')
      });

    } else if (req.method === 'POST') {
      // Update soundboard volume
      const { soundboardVolume } = req.body;

      if (typeof soundboardVolume !== 'number' || soundboardVolume < 0 || soundboardVolume > 1) {
        return res.status(400).json({ error: 'Volume must be a number between 0 and 1' });
      }

      await db.setSetting('soundboardVolume', soundboardVolume.toString());

      // Broadcast volume update to overlay
      if (global.broadcastToClients) {
        global.broadcastToClients({
          type: 'soundboard-volume',
          volume: soundboardVolume,
          timestamp: new Date().toISOString()
        });
      }

      res.status(200).json({
        success: true,
        message: 'Volume updated successfully',
        soundboardVolume
      });

    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Soundboard settings error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(handler);
