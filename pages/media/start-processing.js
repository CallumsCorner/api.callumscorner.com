const { overlayOnly } = require('../../lib/auth');
const db = require('../../lib/database');
const cors = require('../../lib/cors');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { mediaId } = req.body;
    if (!mediaId) {
      return res.status(400).json({ error: 'Media ID is required' });
    }

    const mediaPaused = await db.getSetting('mediaPaused');
    if (mediaPaused === 'true') {
      return res.status(400).json({ error: 'Media system is paused' });
    }
    
    const currentlyPlaying = await db.getSetting('currentlyPlayingMedia');
    const currentMediaId = await db.getSetting('currentMediaId');
    
    if (currentlyPlaying === 'true') {
      // Check if the current media has been stuck for too long
      const mediaStartTime = await db.getSetting('mediaStartTime');
      const now = new Date();
      
      if (mediaStartTime && mediaStartTime !== 'null') {
        const startTime = new Date(mediaStartTime);
        const timeDiff = now - startTime;
        const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
        
        if (timeDiff > fiveMinutes) {
          console.log(`[recovery] Media ${currentMediaId} has been processing for ${Math.round(timeDiff/1000/60)} minutes, auto-clearing stuck state`);
          
          // Auto-clear the stuck state
          await db.setSetting('currentlyPlayingMedia', 'false');
          await db.setSetting('currentMediaId', 'null');
          await db.setSetting('mediaStartTime', 'null');
          
          if (global.broadcastToClients) {
            global.broadcastToClients({
              type: 'media-processing-timeout',
              mediaId: currentMediaId,
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          return res.status(400).json({ error: 'Another media item is already playing' });
        }
      } else {
        // No start time recorded, assume it's stuck and clear it
        console.log(`[recovery] No start time recorded for media ${currentMediaId}, clearing stuck state`);
        await db.setSetting('currentlyPlayingMedia', 'false');
        await db.setSetting('currentMediaId', 'null');
        await db.setSetting('mediaStartTime', 'null');
      }
    }

    await db.setSetting('currentlyPlayingMedia', 'true');
    await db.setSetting('currentMediaId', mediaId.toString());
    await db.setSetting('mediaStartTime', new Date().toISOString());

    if (global.broadcastToClients) {
      global.broadcastToClients({
        type: 'media-processing-started',
        mediaId: mediaId,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({ success: true, message: 'Media processing started' });
  } catch (error) {
    console.error('Start media processing error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(overlayOnly(handler));
