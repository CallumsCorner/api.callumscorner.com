const { requireAuth } = require('../../lib/auth');
const db = require('../../lib/database');
const cors = require('../../lib/cors');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log(`User '${req.user.username}' paused the media.`);
    // Set paused state first
    await db.setSetting('mediaPaused', 'true');

    // Check if media is currently playing and stop it (but keep in queue)
    const currentMediaId = await db.getSetting('currentMediaId');
    if (currentMediaId && currentMediaId !== 'null') {
      console.log(`[pause] Keeping media ${currentMediaId} in queue for resume`);
      // just clear processing flags so it stays in queue
    }

    // keep currentMediaId for resume
    await db.setSetting('currentlyPlayingMedia', 'false');
    // Note: Keep currentMediaId so we know what to resume
    console.log(`[pause] Cleared media processing flags but kept currentMediaId for resume`);
    
    // Notify overlay to stop immediately (media will be resumed later)
    if (global.broadcastToClients) {
      global.broadcastToClients({
        type: 'pause-media',
        timestamp: new Date().toISOString(),
        keepInQueue: true // Tell overlay media is kept in queue for resume
      });
    }

    res.status(200).json({ success: true, message: 'Media system paused and cleared.' });
  } catch (error) {
    console.error('Pause media error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAuth(handler));