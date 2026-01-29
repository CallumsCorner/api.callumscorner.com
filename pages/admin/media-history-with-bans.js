const { requireAdmin, adminOnly } = require('../../lib/auth'); 
const db = require('../../lib/database'); 
const cors = require('../../lib/cors'); 

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const mediaHistory = await db.query(`
    SELECT 
      mh.*,
      CASE WHEN bu.id IS NOT NULL THEN 1 ELSE 0 END as is_user_banned,
      CASE WHEN bv.id IS NOT NULL THEN 1 ELSE 0 END as is_video_banned
    FROM MediaHistory mh 
    LEFT JOIN BannedUsers bu ON mh.payer_id = bu.payer_id 
    LEFT JOIN BannedVideos bv ON (
      SUBSTRING_INDEX(SUBSTRING_INDEX(mh.media_url, 'v=', -1), '&', 1) = bv.video_id
      OR SUBSTRING_INDEX(mh.media_url, '/', -1) = bv.video_id
      OR SUBSTRING_INDEX(SUBSTRING_INDEX(mh.media_url, '?v=', -1), '&', 1) = bv.video_id
    )
    WHERE mh.is_replay = 0
    ORDER BY mh.created_at DESC 
    LIMIT 100
  `);
    
    res.status(200).json(mediaHistory);
  } catch (error) {
    console.error('Get media history with bans error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(adminOnly(requireAdmin(handler)));
