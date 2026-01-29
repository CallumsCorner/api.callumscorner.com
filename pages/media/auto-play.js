const db = require('../../lib/database'); 
const cors = require('../../lib/cors'); 

async function triggerNextMedia() {
  try {
    const mediaRequestsEnabled = await db.getSetting('mediaRequestsEnabled');
    const mediaPaused = await db.getSetting('mediaPaused');

    if (mediaRequestsEnabled !== 'true' || mediaPaused === 'true') {
      return { success: false, message: mediaPaused === 'true' ? 'Media system paused' : 'Media requests disabled' };
    }

    const currentlyPlayingMedia = await db.getSetting('currentlyPlayingMedia');
    if (currentlyPlayingMedia === 'true') {
      return { success: false, message: 'Media already playing' };
    }

    const nextMedia = await db.getNextMediaFromQueue();
    if (!nextMedia) {
      return { success: false, message: 'No media in queue' };
    }

    await db.setSetting('currentlyPlayingMedia', 'true');
    await db.setSetting('currentMediaId', nextMedia.id.toString());

    if (global.broadcastToClients) {
      global.broadcastToClients({
        type: 'media',
        media: {
          id: nextMedia.id,
          order_id: nextMedia.order_id,
          donor_name: String(nextMedia.donor_name || 'Anonymous').trim(),
          media_url: String(nextMedia.media_url).trim(),
          media_start_time: nextMedia.media_start_time || 0,
          video_title: String(nextMedia.video_title || '').trim(),
          video_thumbnail: String(nextMedia.video_thumbnail || '').trim(),
          video_duration: nextMedia.video_duration || 0,
          is_replay: Boolean(nextMedia.is_replay),
          created_at: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    }
    return { success: true, message: 'Media auto-played successfully', media: nextMedia };
  } catch (error) {
    console.error('Error in triggerNextMedia:', error);
    // Attempt to clear flags on error to prevent getting stuck
    try {
      await db.setSetting('currentlyPlayingMedia', 'false');
      await db.setSetting('currentMediaId', 'null');
    } catch (clearError) {
      console.error('Failed to clear media flags after error:', clearError);
    }
    return { success: false, message: 'Internal server error. Contact kernelscorner on discord' };
  }
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = await triggerNextMedia();

  if (result.success) {
    res.status(200).json(result);
  } else {
    // For the endpoint, we send 200 for "nothing to do" cases, but 500 for actual errors
    if (result.message === 'Internal server error. Contact kernelscorner on discord') {
      res.status(500).json({ error: result.message });
    } else {
      res.status(200).json({ message: result.message });
    }
  }
}

module.exports = cors(handler);
module.exports.triggerNextMedia = triggerNextMedia;