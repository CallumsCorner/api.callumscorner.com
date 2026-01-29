const { requireAdmin } = require('../../../lib/auth'); 
const db = require('../../../lib/database'); 
const cors = require('../../../lib/cors'); 

// Extract YouTube video ID
const extractYouTubeVideoId = (url) => {
  if (!url) return null;
  
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const bannedVideos = await db.getAllBannedVideos();
      res.status(200).json(bannedVideos);
      
    } else if (req.method === 'POST') {
      const { video_url, reason, notes } = req.body;
      
      if (!video_url) {
        return res.status(400).json({ error: 'Video URL is required' });
      }
      
      const videoId = extractYouTubeVideoId(video_url);
      if (!videoId) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
      }
      
      // Check if already banned
      const existing = await db.query('SELECT id FROM BannedVideos WHERE video_id = ?', [videoId]);
      if (existing.length > 0) {
        return res.status(400).json({ error: 'Video is already banned' });
      }
      
      // Get video title if possible
      let videoTitle = '';
      try {
        const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const response = await fetch(oEmbedUrl);
        if (response.ok) {
          const data = await response.json();
          videoTitle = data.title || '';
        }
      } catch (error) {
        console.warn('Failed to get video title:', error);
      }
      
      await db.banVideo(videoId, video_url, videoTitle, reason, notes, req.user.user_id);
      
      res.status(201).json({ success: true, message: 'Video banned successfully' });
      
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Video ban management error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAdmin(handler));
