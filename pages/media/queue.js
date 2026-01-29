const db = require('../../lib/database');
const cors = require('../../lib/cors');
const { getSessionUser } = require('../../lib/auth');
const { isAllowedReferrer } = require('../../lib/referrer');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Increment queue refresh counter (for rewind stats collection)
    db.query(`UPDATE Settings SET setting_value = setting_value + 1 WHERE setting_key = 'rewindQueueRefreshCount'`).catch(() => {});

    const user = await getSessionUser(req);
    const rawQueue = await db.getMediaQueue();
    const includeMessage = isAllowedReferrer(req);
    
    // Clean the queue data
    const cleanQueue = rawQueue.map(item => {
      const mediaItem = {
        donor_name: String(item.donor_name || 'Anonymous').trim(),
        media_url: String(item.media_url).trim(),
        media_start_time: parseInt(item.media_start_time) || 0,
        video_title: String(item.video_title || '').trim(),
        // video_thumbnail: String(item.video_thumbnail || '').trim(),
        // video_duration: parseInt(item.video_duration) || 0,
        is_replay: Boolean(item.is_replay),
        created_at: item.created_at
      };

      // Only include order_id if the user is authenticated
      if (user || includeMessage) {
        mediaItem.order_id = item.order_id;
        mediaItem.id = item.id;
        mediaItem.donation_id = item.donation_id;
      }
      
      return mediaItem;
    });
    
    res.status(200).json(cleanQueue);
  } catch (error) {
    console.error('Get media queue error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(handler);