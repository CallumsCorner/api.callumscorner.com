const cors = require('../../../lib/cors');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sessionToken = req.cookies?.twitch_session;

    // If session token exists, invalidate it in the database
    if (sessionToken) {
      const db = require('../../../lib/database');
      await db.deleteTwitchSession(sessionToken);
      console.log(`[twitch logout] Invalidated session token`);
    }

    const logoutCookieOptions = [
      'twitch_session=',
      'HttpOnly',
      'Path=/',
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      'Domain=.callumscorner.com',
      'Secure',
      'SameSite=Lax'
    ].filter(Boolean).join('; ');

    res.setHeader('Set-Cookie', logoutCookieOptions);

    return res.status(200).json({
      success: true,
      message: 'Successfully logged out from Twitch'
    });

  } catch (error) {
    console.error('Twitch logout error:', error);
    return res.status(500).json({
      error: 'Failed to logout',
      message: error.message
    });
  }
}

module.exports = cors(handler);