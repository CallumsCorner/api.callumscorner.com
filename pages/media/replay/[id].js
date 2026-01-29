const { requireAuth } = require('../../../lib/auth');
const db = require('../../../lib/database');
const cors = require('../../../lib/cors');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Increment replay counter (for rewind stats collection)
    db.query(`UPDATE Settings SET setting_value = setting_value + 1 WHERE setting_key = 'rewindReplayCount'`).catch(() => {});

    const { id } = req.params;
    const mediaId = parseInt(id);

    if (!mediaId) {
      return res.status(400).json({ error: 'Invalid media ID' });
    }

    const media = await db.getMediaFromHistory(mediaId);
    if (!media) {
      return res.status(404).json({ error: 'Media not found in history' });
    }

    const replayOrderId = `${media.order_id}_media_replay_${Date.now()}`;
    
    await db.addMediaToQueue({
      order_id: replayOrderId,
      donor_name: media.donor_name,
      media_url: media.media_url,
      media_start_time: media.media_start_time,
      video_title: media.video_title,
      payer_id: media.payer_id || null,
      is_replay: true
    });

    // Notify overlay that the queue has been updated
    if (global.broadcastToClients) {
      global.broadcastToClients({
        type: 'media-queue-updated',
        newMedia: true,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({ success: true, message: 'Media added to replay queue.' });
  } catch (error)    {
    console.error('Replay media error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAuth(handler));