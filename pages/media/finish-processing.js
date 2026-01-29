const db = require('../../lib/database');
const cors = require('../../lib/cors');
const { overlayOnly } = require('../../lib/auth');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { mediaId } = req.body;
    if (!mediaId) {
      return res.status(400).json({ error: 'Media ID is required' });
    }

    // Handle recovery requests (when overlay detects stuck state)
    if (mediaId === 'recovery') {
      console.log('[RECOVERY] Clearing stuck media processing state');
      await db.setSetting('currentlyPlayingMedia', 'false');
      await db.setSetting('currentMediaId', 'null');
      await db.setSetting('mediaStartTime', 'null');
      
      if (global.broadcastToClients) {
        global.broadcastToClients({
          type: 'media-processing-recovered',
          timestamp: new Date().toISOString(),
        });
      }
      
      return res.status(200).json({ success: true, message: 'Media processing state cleared (recovery)' });
    }

    const mediaResult = await db.query('SELECT * FROM MediaQueue WHERE id = ?', [mediaId]);
    const media = mediaResult[0];

    if (media) {
      await db.addMediaToHistory(
        media.order_id, media.donor_name, media.media_url, media.media_start_time,
        media.video_title, media.video_thumbnail, media.video_duration, Boolean(media.is_replay),
        media.donation_id, media.payer_id || null
      );
      await db.removeMediaFromQueue(media.id);
    }

    await db.setSetting('currentlyPlayingMedia', 'false');
    await db.setSetting('currentMediaId', 'null');
    await db.setSetting('mediaStartTime', 'null');

    if (global.broadcastToClients) {
      global.broadcastToClients({
        type: 'media-processing-finished',
        mediaId: mediaId,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({ success: true, message: 'Media processing finished' });
  } catch (error) {
    console.error('Finish media processing error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(overlayOnly(handler));
