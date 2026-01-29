
const { requireAuth } = require('../../lib/auth'); 
const db = require('../../lib/database'); 
const cors = require('../../lib/cors'); 

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log(`[media skip] User '${req.user.username}' skipped the media.`);

    // Increment media skip counter (for rewind stats collection)
    db.query(`UPDATE Settings SET setting_value = setting_value + 1 WHERE setting_key = 'rewindMediaSkipCount'`).catch(() => {});

    const currentMediaId = await db.getSetting('currentMediaId');
    let skippedMedia = null;
    
    if (currentMediaId && currentMediaId !== 'null') {
      const mediaResult = await db.query('SELECT * FROM MediaQueue WHERE id = ?', [parseInt(currentMediaId)]);
      if (mediaResult.length > 0) {
        skippedMedia = mediaResult[0];
        await db.addMediaToHistory(
          skippedMedia.order_id, skippedMedia.donor_name, skippedMedia.media_url,
          skippedMedia.media_start_time, skippedMedia.video_title, skippedMedia.video_thumbnail,
          skippedMedia.video_duration, Boolean(skippedMedia.is_replay), skippedMedia.donation_id,
          skippedMedia.payer_id || null
        );
        await db.removeMediaFromQueue(skippedMedia.id);
      }
    }

    await db.setSetting('currentlyPlayingMedia', 'false');
    await db.setSetting('currentMediaId', 'null');
    await db.setSetting('mediaStartTime', 'null');

    if (global.broadcastToClients) {
      // Tell overlay to immediately stop what it's doing
      global.broadcastToClients({
        type: 'skip-media',
        timestamp: new Date().toISOString(),
      });
      // Tell it to check for new work
      global.broadcastToClients({
        type: 'media-queue-updated',
        timestamp: new Date().toISOString(),
      });
    }

    console.log('Media skipped:', skippedMedia ? skippedMedia.video_title : 'none');

    res.status(200).json({ 
      success: true, 
      message: skippedMedia ? `Skipped media from ${skippedMedia.donor_name}` : 'No media to skip',
      skippedMedia: skippedMedia
    });
  } catch (error) {
    console.error('Skip media error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAuth(handler));