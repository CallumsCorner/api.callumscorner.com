const { requireAuth } = require('../../../lib/auth'); 
const db = require('../../../lib/database'); 
const cors = require('../../../lib/cors'); 

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Get sound effect settings
      const soundEffectsEnabled = await db.getSetting('soundEffectsEnabled');
      const activeSoundEffectId = await db.getSetting('activeSoundEffectId');
      const soundEffectVolume = await db.getSetting('soundEffectVolume');

      res.status(200).json({
        soundEffectsEnabled: soundEffectsEnabled === 'true',
        activeSoundEffectId: activeSoundEffectId !== 'null' ? parseInt(activeSoundEffectId) : null,
        soundEffectVolume: parseFloat(soundEffectVolume || '0.7'),
      });
      
    } else if (req.method === 'POST') {
      // Update sound effect settings
      const { soundEffectsEnabled, soundEffectVolume } = req.body;

      const updatedSettings = {};

      if (typeof soundEffectsEnabled === 'boolean') {
        await db.setSetting('soundEffectsEnabled', soundEffectsEnabled.toString());
        updatedSettings.soundEffectsEnabled = soundEffectsEnabled;
      }

      if (typeof soundEffectVolume === 'number' && soundEffectVolume >= 0 && soundEffectVolume <= 1) {
        await db.setSetting('soundEffectVolume', soundEffectVolume.toString());
        updatedSettings.soundEffectVolume = soundEffectVolume;
      }

      // Broadcast settings update to overlay
      if (global.broadcastToClients && Object.keys(updatedSettings).length > 0) {
        global.broadcastToClients({
          type: 'settings-update',
          section: 'sound',
          settings: updatedSettings,
          timestamp: new Date().toISOString()
        });
      }

      res.status(200).json({ success: true, message: 'Settings updated successfully' });
      
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Sound effects settings error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAuth(handler));
