const db = require('../../lib/database'); 
const cors = require('../../lib/cors'); 
const { hiddenOnly } = require('../../lib/auth');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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
  } catch (error) {
    console.error('Media settings error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(hiddenOnly(handler));
