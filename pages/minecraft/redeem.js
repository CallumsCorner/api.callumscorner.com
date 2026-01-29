const cors = require('../../lib/cors');
const db = require('../../lib/database');
const { optionalApiKey } = require('../../lib/apiKey');

const MAX_REDEMPTIONS_PER_WEEK = 5;

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for valid API key first
  const apiKeyData = await optionalApiKey(req, 'minecraft:addcredit');

  if (!apiKeyData) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { twitch_username, minecraft_uuid, minecraft_username } = req.body;

    if (!twitch_username || !minecraft_uuid || !minecraft_username) {
    return res.status(400).json({
        error: 'MISSING',
        message: 'Insufficient parameters'
      });
    }
    // weekly limits
    const weeklyRedemptions = await db.query(`
      SELECT COUNT(*) as count
      FROM MinecraftRedemptions
      WHERE minecraft_uuid = ? AND redeemed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `, [minecraft_uuid]);

    const redemptionCount = weeklyRedemptions[0]?.count || 0;

    if (redemptionCount >= MAX_REDEMPTIONS_PER_WEEK) {
      return res.status(429).json({
        error: 'Weekly limit reached',
        message: `This Minecraft account has already redeemed ${MAX_REDEMPTIONS_PER_WEEK} donations in the last 7 days. Try again later.`,
        redemptions_this_week: redemptionCount,
        max_per_week: MAX_REDEMPTIONS_PER_WEEK
      });
    }

    // look up Twitch user (case-insensitive)
    const twitchUsers = await db.query(`
      SELECT id, twitch_user_id, username, display_name
      FROM TwitchAuth
      WHERE LOWER(username) = LOWER(?)
    `, [twitch_username]);

    if (twitchUsers.length === 0) {
      return res.status(404).json({
        error: 'Twitch user not found',
        message: `The Twitch user "${twitch_username}" is not in the system. Please sign in at donate.callumscorner.com first.`
      });
    }

    const twitchUser = twitchUsers[0];

    // Get the minecraft credit amount from settings (default to 2.22)
    const minecraftCreditAmount = parseFloat(await db.getSetting('freeDonationMinecraftAmount')) || 2.22;

    // set the  minecraft credit record
    await db.query(`
      INSERT INTO FreeDonationCredits (
        twitch_auth_id, credit_type, amount_available, amount_used,
        period_start, period_end, last_reset
      ) VALUES (?, 'minecraft', ?, 0, '2020-01-01', '2099-12-31', CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        amount_available = amount_available + VALUES(amount_available),
        updated_at = CURRENT_TIMESTAMP
    `, [twitchUser.id, minecraftCreditAmount]);

    // log for rate limiting
    await db.query(`
      INSERT INTO MinecraftRedemptions (minecraft_uuid, minecraft_username, twitch_auth_id, credit_amount)
      VALUES (?, ?, ?, ?)
    `, [minecraft_uuid, minecraft_username, twitchUser.id, minecraftCreditAmount]);

    const remainingRedemptions = MAX_REDEMPTIONS_PER_WEEK - redemptionCount - 1;

    return res.status(200).json({
      success: true,
      message: `Successfully added £${minecraftCreditAmount.toFixed(2)} credit to ${twitchUser.display_name || twitchUser.username}`,
      twitch_username: twitchUser.username,
      twitch_display_name: twitchUser.display_name,
      minecraft_username: minecraft_username,
      minecraft_uuid: minecraft_uuid,
      credit_amount: minecraftCreditAmount,
      redemptions_remaining_this_week: remainingRedemptions
    });

  } catch (error) {
    console.error('Minecraft redeem error:', error);
    return res.status(500).json({
      error: 'Failed to process Minecraft redemption',
      message: error.message
    });
  }
}

module.exports = cors(handler);
