const db = require('../../lib/database');
const cors = require('../../lib/cors');
const { overlayOnly } = require('../../lib/auth');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const backupPlaylistEnabled = await db.getSetting('backupPlaylistEnabled');
    const backupPlaylistUrl = await db.getSetting('backupPlaylistUrl');
    const backupPlaylistVolume = await db.getSetting('backupPlaylistVolume');

    res.status(200).json({
      backupPlaylistEnabled: backupPlaylistEnabled === 'true',
      backupPlaylistUrl: backupPlaylistUrl || '',
      backupPlaylistVolume: parseFloat(backupPlaylistVolume || '0.3'),
    });
  } catch (error) {
    console.error('Overlay backup playlist settings error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(overlayOnly(handler));