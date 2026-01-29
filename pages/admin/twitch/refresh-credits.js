const cors = require('../../../lib/cors');
const { requireAdmin } = require('../../../lib/auth');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = require('../../../lib/database');
    const twitchOAuth = require('../../../lib/twitchOAuth');

    // Get all active Twitch users
    const users = await db.query(`
      SELECT twitch_user_id, username, subscriber_tier, is_vip, updated_at
      FROM TwitchAuth
      WHERE token_expires_at > NOW()
      ORDER BY updated_at ASC
    `);

    console.log(`Starting refresh for ${users.length} users`);

    let refreshedCount = 0;
    let errorCount = 0;
    const results = [];

    for (const user of users) {
      try {
        console.log(`Refreshing user ${user.username} (${user.twitch_user_id})`);

        // Refresh user data which will automatically update subscription status and credits
        await twitchOAuth.refreshUserData(user.twitch_user_id);

        refreshedCount++;
        results.push({
          userId: user.twitch_user_id,
          username: user.username,
          status: 'success',
          previousTier: user.subscriber_tier,
          previousVip: user.is_vip
        });

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error refreshing user ${user.username}:`, error);
        errorCount++;
        results.push({
          userId: user.twitch_user_id,
          username: user.username,
          status: 'error',
          error: error.message
        });
      }
    }

    console.log(`Completed: ${refreshedCount} successful, ${errorCount} errors`);

    return res.status(200).json({
      success: true,
      message: `Refreshed credits for ${refreshedCount} users`,
      totalUsers: users.length,
      refreshed: refreshedCount,
      errors: errorCount,
      results: results
    });

  } catch (error) {
    console.error('Credit refresh error:', error);
    return res.status(500).json({
      error: 'Failed to refresh credits',
      message: error.message
    });
  }
}

module.exports = cors(requireAdmin(handler));