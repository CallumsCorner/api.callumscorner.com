const cors = require('../../../lib/cors');
const twitchOAuth = require('../../../lib/twitchOAuth');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check if Twitch integration is enabled
    const db = require('../../../lib/database');
    const twitchEnabled = await db.getSetting('twitchIntegrationEnabled');

    if (twitchEnabled !== 'true') {
      return res.status(503).json({
        error: 'Twitch integration is currently disabled',
        message: 'Twitch Loyalty Rewards are not enabled at this time'
      });
    }

    // Check if Twitch is properly configured
    if (!twitchOAuth.isConfigured()) {
      console.error('twitch oauth not properly configured.');
      return res.status(500).json({
        error: 'Twitch integration not configured',
        message: 'Server configuration error. Please contact kernelscorner on discord.'
      });
    }

    // gen oauth url with state for csrf protection
    const { url, state } = twitchOAuth.generateAuthUrl();

    // Store state in database for verification (more reliable than cookies)
    await db.storeOAuthState(state);

    console.log(`Stored state in database: ${state}`);

    console.log(`Initiating OAuth flow with state: ${state}`);

    return res.status(200).json({
      success: true,
      authUrl: url,
      state: state
    });

  } catch (error) {
    console.error('Twitch OAuth login error:', error);
    return res.status(500).json({
      error: 'Failed to initiate Twitch authentication',
      message: error.message
    });
  }
}

module.exports = cors(handler);