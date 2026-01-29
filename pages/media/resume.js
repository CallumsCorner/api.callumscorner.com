const { requireAuth } = require('../../lib/auth'); 
const db = require('../../lib/database'); 
const cors = require('../../lib/cors'); 

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log(`[resume] User '${req.user.username}' resumed the media.`);

    // Set media resumed state
    await db.setSetting('mediaPaused', 'false');

    await db.setSetting('currentlyPlayingMedia', 'false');

    // Log if there's media that will be resumed
    const currentMediaId = await db.getSetting('currentMediaId');
    if (currentMediaId && currentMediaId !== 'null') {
      console.log(`[resume] Will restart media ${currentMediaId} from the beginning`);
    }

    // Broadcast resume message to overlay
    if (global.broadcastToClients) {
      global.broadcastToClients({
        type: 'resume-media',
        timestamp: new Date().toISOString(),
        restartFromBeginning: true // tell it to restart current media from beginning
      });

      // + trigger media queue sync
      global.broadcastToClients({
        type: 'media-queue-updated',
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({ success: true, message: 'Media system resumed' });
  } catch (error) {
    console.error('Resume media error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAuth(handler));