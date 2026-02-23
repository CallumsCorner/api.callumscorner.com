const { requireAdmin } = require('../../../lib/auth');
const db = require('../../../lib/database');
const cors = require('../../../lib/cors');

async function handler(req, res) {
  try {
    const { id } = req.params;

    if (req.method === 'GET') {
      const { source } = req.query; // 'queue' or 'history'

      let media;
      if (source === 'queue') {
        media = await db.getMediaFromQueue(id);
      } else {
        media = await db.getMediaFromHistory(id);
      }

      if (!media) {
        return res.status(404).json({ error: 'Media not found' });
      }

      return res.status(200).json(media);

    } else if (req.method === 'DELETE') {
      const removed = await db.removeMediaFromQueueAndStore(id);
      if (!removed) {
        return res.status(404).json({ error: 'Media not found in queue' });
      }
      return res.status(200).json({ success: true, message: 'Media removed from queue', media: removed });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Media detail error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = cors(requireAdmin(handler));
