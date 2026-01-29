const { requireAuth } = require('../../../lib/auth'); 
const db = require('../../../lib/database'); 
const cors = require('../../../lib/cors'); 

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Get media settings
      const mediaRequestsEnabled = await db.getSetting('mediaRequestsEnabled');
      const mediaVolume = await db.getSetting('mediaVolume');
      const mediaVisible = await db.getSetting('mediaVisible');
      const mediaPaused = await db.getSetting('mediaPaused');

      res.status(200).json({
        mediaRequestsEnabled: mediaRequestsEnabled === 'true',
        mediaVolume: parseFloat(mediaVolume || '0.8'),
        mediaVisible: mediaVisible === 'true',
        mediaPaused: mediaPaused === 'true',
      });
      
    } else if (req.method === 'POST') {
      // Update media settings
      const { mediaRequestsEnabled, mediaVolume, mediaVisible, mediaPaused } = req.body;

      const updatedSettings = {};

      if (typeof mediaRequestsEnabled === 'boolean') {
        await db.setSetting('mediaRequestsEnabled', mediaRequestsEnabled.toString());
        updatedSettings.mediaRequestsEnabled = mediaRequestsEnabled;
      }

      if (typeof mediaVolume === 'number' && mediaVolume >= 0 && mediaVolume <= 1) {
        await db.setSetting('mediaVolume', mediaVolume.toString());
        updatedSettings.mediaVolume = mediaVolume;
      }

      if (typeof mediaVisible === 'boolean') {
        await db.setSetting('mediaVisible', mediaVisible.toString());
        updatedSettings.mediaVisible = mediaVisible;
      }

      if (typeof mediaPaused === 'boolean') {
        await db.setSetting('mediaPaused', mediaPaused.toString());
        updatedSettings.mediaPaused = mediaPaused;
      }

      // Broadcast settings update to overlay
      if (global.broadcastToClients && Object.keys(updatedSettings).length > 0) {
        global.broadcastToClients({
          type: 'settings-update',
          section: 'media',
          settings: updatedSettings,
          timestamp: new Date().toISOString()
        });
      }

      res.status(200).json({ success: true, message: 'Media settings updated successfully' });
      
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Media settings error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAuth(handler));
