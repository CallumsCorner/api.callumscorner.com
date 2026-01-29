
const db = require('../../lib/database'); 
const cors = require('../../lib/cors'); 

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { mediaId } = req.body;
    const mediaIdToProcess = mediaId || await db.getSetting('currentMediaId');

    if (!mediaIdToProcess || mediaIdToProcess === 'null') {
      await db.setSetting('currentlyPlayingMedia', 'false');
      await db.setSetting('currentMediaId', 'null');
      return res.status(200).json({ success: true, message: 'No current media, flags cleared' });
    }

    const queueResult = await db.query('SELECT * FROM MediaQueue WHERE id = ?', [parseInt(mediaIdToProcess)]);
    const media = queueResult[0];
    
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

    if (global.broadcastToClients) {
      global.broadcastToClients({
        type: 'media-queue-updated',
        timestamp: new Date().toISOString()
      });
    }

    console.log('Media sequence completed:', media ? media.video_title : 'unknown');

    res.status(200).json({ success: true, message: 'Media sequence completed successfully' });
  } catch (error) {
    console.error('Complete media error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(handler);