const db = require('../../lib/database');
const cors = require('../../lib/cors');
const { getSessionUser } = require('../../lib/auth');
const { isAllowedReferrer } = require('../../lib/referrer');
const { optionalApiKey } = require('../../lib/apiKey');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Increment queue refresh counter (for rewind stats collection)
    db.query(`UPDATE Settings SET setting_value = setting_value + 1 WHERE setting_key = 'rewindQueueRefreshCount'`).catch(() => {});

    const user = await getSessionUser(req);
    const apiKeyData = await optionalApiKey(req, 'donations:read');
    const rawQueue = await db.getDonationQueue();

    // Only include message if request Referer origin is allowed OR valid API key with donations:read (ayup.cc)
    const includeMessage = isAllowedReferrer(req) || apiKeyData;

    // Clean the queue data
    const cleanQueue = rawQueue.map(item => {
      const donation = {
        name: String(item.name || 'Anonymous').trim(),
        amount: parseFloat(item.amount),
        is_replay: Boolean(item.is_replay),
        created_at: item.created_at
      };

      // Include message for allowed referers or valid API key
      if (includeMessage) {
        donation.message = item.message ? String(item.message).trim() : '';
      }

      // Only include order_id/id for allowed referers (not API keys) or authenticated users
      if (isAllowedReferrer(req) || user) {
        donation.order_id = item.order_id;
        donation.id = item.id;
      }

      return donation;
    });

    res.status(200).json(cleanQueue);
  } catch (error) {
    console.error('Get queue error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(handler);