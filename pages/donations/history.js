const { requireAuth, getSessionUser } = require('../../lib/auth');
const db = require('../../lib/database');
const cors = require('../../lib/cors');
const { isAllowedReferrer } = require('../../lib/referrer');
const { optionalApiKey } = require('../../lib/apiKey');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check for valid API key first
    const apiKeyData = await optionalApiKey(req, 'donations:read');

    // If no API key, require session auth
    if (!apiKeyData) {
      const user = await getSessionUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
    }

    const history = await db.getDonationHistory();

    const response = history.map(item => {
      // If allowed referer, return all fields
      if (isAllowedReferrer(req)) {
        return { ...item };
      }

      // If API key, return limited fields only
      if (apiKeyData) {
        return {
          name: String(item.name || 'Anonymous').trim(),
          amount: parseFloat(item.amount),
          message: item.message ? String(item.message).trim() : '',
          is_replay: Boolean(item.is_replay),
          created_at: item.created_at
        };
      }

      // Authenticated user without allowed referer - return all except message
      const donation = { ...item };
      delete donation.message;
      return donation;
    });

    res.status(200).json(response);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(handler);