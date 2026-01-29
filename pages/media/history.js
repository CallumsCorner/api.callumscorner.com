const db = require('../../lib/database'); 
const cors = require('../../lib/cors');
const { getSessionUser } = require('../../lib/auth');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // increment queue refresh count (this endpoint is fetched alongside /media/queue and /donations/queue on the public queue page)
    db.query(`UPDATE Settings SET setting_value = setting_value + 1 WHERE setting_key = 'rewindQueueRefreshCount'`).catch(() => {});

    const user = await getSessionUser(req);
    const history = await db.getMediaHistory();
    
    // return history based on authentication
    const responseData = history.map(item => {
      // If the user is an admin, return all data
      if (user) {
        return item;
      }

      // Otherwise, return only the public-safe fields
      return {
        media_url: item.media_url,
        donor_name: item.donor_name,
        media_start_time: item.media_start_time,
        created_at: item.created_at,
        video_title: item.video_title,
        //video_thumbnail: item.video_thumbnail
      };
    });

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Get media history error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(handler);