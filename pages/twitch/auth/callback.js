// yes - the twitch auth system is a fucking nightmare
// particularly the credit system
// twitch is so overly complicated for no reason
// im going to rewrite this entire system in a few months when i have time
const cors = require('../../../lib/cors');
const twitchOAuth = require('../../../lib/twitchOAuth');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state, error, error_description } = req.query;

    // oauth errors
    if (error) {
      console.error('oauth error:', error, error_description);
      return res.redirect(`${process.env.DONATE_URL || 'https://donate.callumscorner.com'}?twitch_error=${encodeURIComponent(error_description || error)}`);
    }

    // Verify required parameters
    if (!code || !state) {
      console.error('missing oauth params:', { code: !!code, state: !!state });
      return res.redirect(`${process.env.DONATE_URL || 'https://donate.callumscorner.com'}?twitch_error=invalid_callback`);
    }

    // csrf protection
    const db = require('../../../lib/database');

    const isValidState = await db.validateOAuthState(state);

    if (!isValidState) {
      console.error('oauth state mismatch or expired:', { received: state });
      return res.redirect(`${process.env.DONATE_URL || 'https://donate.callumscorner.com'}?twitch_error=invalid_state`);
    }

    // Delete the used state to prevent replay attacks
    await db.deleteOAuthState(state);

    // exchange authorization code with twitch for access token
    const tokenData = await twitchOAuth.exchangeCodeForToken(code);

    // Get user information
    const userInfo = await twitchOAuth.getUserInfo(tokenData.access_token);

    // Check subscription status (includes VIP status)
    const subscriptionInfo = await twitchOAuth.checkSubscription(tokenData.access_token, userInfo.id);

    // Store authentication data in database
    await twitchOAuth.storeUserAuth(tokenData, userInfo, subscriptionInfo, subscriptionInfo.isVip);
    console.log(`User auth data stored for: ${userInfo.login}`);

    // Generate session toklen
    const crypto = require('crypto');
    const sessionToken = crypto.randomBytes(32).toString('hex');

    // Store session in database
    const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await db.createTwitchSession({
      session_token: sessionToken,
      twitch_user_id: userInfo.id,
      expires_at: sessionExpiry,
      created_at: new Date()
    });

    // First, clear any old cookie that might exist on api.callumscorner.com (without Domain attribute)
    // This handles the migration from the old cookie domain to the new parent domain
    // since i moved from donate.callumscorner.com to callumscorner.com at the request of stripe
    const clearOldCookie = [
      'twitch_session=',
      'HttpOnly',
      'Path=/',
      'Expires=Thu, 01 Jan 2010 00:00:00 GMT', // this cookie expired 15 YEARS AGO
      'Secure',
      'SameSite=Lax'
    ].filter(Boolean).join('; ');

    // Set the new cookie on the parent domain
    const sessionCookieOptions = [
      `twitch_session=${sessionToken}`,
      'HttpOnly',
      'Path=/',
      `Expires=${sessionExpiry.toUTCString()}`,
      'Domain=.callumscorner.com',
      'Secure',
      'SameSite=Lax'
    ].filter(Boolean).join('; ');

    // Set both cookies - first clears old, second sets new
    res.setHeader('Set-Cookie', [clearOldCookie, sessionCookieOptions]);

    // Redirect back to donate page with success
    return res.redirect(`${process.env.DONATE_URL || 'https://donate.callumscorner.com'}?twitch_success=1`);

  } catch (error) {
    console.error('twitch oauth callback error:', error);
    return res.redirect(`${process.env.DONATE_URL || 'https://donate.callumscorner.com'}?twitch_error=${encodeURIComponent('authentication_failed')}`);
  }
}

module.exports = cors(handler);