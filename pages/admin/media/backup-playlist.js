const { requireAuth } = require('../../../lib/auth'); 
const db = require('../../../lib/database'); 
const cors = require('../../../lib/cors'); 

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Get backup playlist settings
      const backupPlaylistEnabled = await db.getSetting('backupPlaylistEnabled');
      const backupPlaylistUrl = await db.getSetting('backupPlaylistUrl');
      const backupPlaylistVolume = await db.getSetting('backupPlaylistVolume');

      res.status(200).json({
        backupPlaylistEnabled: backupPlaylistEnabled === 'true',
        backupPlaylistUrl: backupPlaylistUrl || '',
        backupPlaylistVolume: parseFloat(backupPlaylistVolume || '0.3'),
      });
      
    } else if (req.method === 'POST') {
      // Update backup playlist settings
      const { backupPlaylistEnabled, backupPlaylistUrl, backupPlaylistVolume } = req.body;

      const updatedSettings = {};

      if (typeof backupPlaylistEnabled === 'boolean') {
        await db.setSetting('backupPlaylistEnabled', backupPlaylistEnabled.toString());
        updatedSettings.backupPlaylistEnabled = backupPlaylistEnabled;
      }

      if (typeof backupPlaylistUrl === 'string') {
        await db.setSetting('backupPlaylistUrl', backupPlaylistUrl);
        updatedSettings.backupPlaylistUrl = backupPlaylistUrl;
      }

      if (typeof backupPlaylistVolume === 'number' && backupPlaylistVolume >= 0 && backupPlaylistVolume <= 1) {
        await db.setSetting('backupPlaylistVolume', backupPlaylistVolume.toString());
        updatedSettings.backupPlaylistVolume = backupPlaylistVolume;
      }

      // Broadcast settings update to overlay
      if (global.broadcastToClients && Object.keys(updatedSettings).length > 0) {
        global.broadcastToClients({
          type: 'settings-update',
          section: 'backup-playlist',
          settings: updatedSettings,
          timestamp: new Date().toISOString()
        });
      }

      res.status(200).json({ success: true, message: 'Backup playlist settings updated successfully' });
      
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Backup playlist settings error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAuth(handler));
