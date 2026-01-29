
const { requireAuth } = require('../../../lib/auth');
const db = require('../../../lib/database');
const cors = require('../../../lib/cors');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const currentlyPlayingMedia = await db.getSetting('currentlyPlayingMedia');
    const currentMediaId = await db.getSetting('currentMediaId');
    let currentMedia = null;

    if (currentlyPlayingMedia === 'true' && currentMediaId && currentMediaId !== 'null') {
      const mediaResult = await db.query('SELECT * FROM MediaQueue WHERE id = ?', [parseInt(currentMediaId)]);
      if (mediaResult.length > 0) {
        currentMedia = mediaResult[0];
      }
    }

    res.status(200).json({
      currentlyPlayingMedia: currentlyPlayingMedia === 'true',
      currentMediaId: currentMediaId !== 'null' ? parseInt(currentMediaId) : null,
      currentMedia: currentMedia
    });

  } catch (error) {
    console.error('Media status error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAuth(handler));