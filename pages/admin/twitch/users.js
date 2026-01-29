const cors = require('../../../lib/cors');
const { requireAdmin } = require('../../../lib/auth');

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const db = require('../../../lib/database');

      // get Twitch users with their accumulated credit information (all periods)
      const users = await db.query(`
        SELECT
          ta.*,
          COALESCE(SUM(fdc.amount_available - fdc.amount_used), 0) as total_credits,
          GROUP_CONCAT(
            CONCAT(fdc.credit_type, ':', (fdc.amount_available - fdc.amount_used))
            SEPARATOR ','
          ) as credit_breakdown
        FROM TwitchAuth ta
        LEFT JOIN FreeDonationCredits fdc ON ta.id = fdc.twitch_auth_id
          AND (fdc.amount_available - fdc.amount_used) > 0
        GROUP BY ta.id
        ORDER BY ta.created_at DESC
      `);

      // Process the credit breakdown
      const processedUsers = users.map(user => ({
        ...user,
        total_credits: parseFloat(user.total_credits) || 0,
        credit_breakdown: user.credit_breakdown ?
          user.credit_breakdown.split(',').reduce((acc, item) => {
            const [type, amount] = item.split(':');
            if (parseFloat(amount) > 0) {
              acc[type] = parseFloat(amount);
            }
            return acc;
          }, {}) : {}
      }));

      return res.status(200).json({
        success: true,
        users: processedUsers
      });

    } catch (error) {
      console.error('Error fetching Twitch users:', error);
      return res.status(500).json({
        error: 'Failed to fetch Twitch users',
        message: error.message
      });
    }
  }

  if (req.method === 'POST') {
    try {
      const { action, twitchUserId, amount, creditType } = req.body;

      if (action === 'grant_credits') {
        if (!twitchUserId || !amount || !creditType) {
          return res.status(400).json({
            error: 'Missing required fields',
            message: 'twitchUserId, amount, and creditType are required'
          });
        }

        const db = require('../../../lib/database');

        // Get the Twitch auth record
        const authData = await db.getTwitchAuth(twitchUserId);
        if (!authData) {
          return res.status(404).json({
            error: 'User not found',
            message: 'Twitch user not found'
          });
        }

        // Calculate current period
        const now = new Date();
        const currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const currentPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        // Grant the credits
        await db.upsertFreeDonationCredit({
          twitch_auth_id: authData.id,
          credit_type: creditType,
          amount_available: parseFloat(amount),
          amount_used: 0,
          period_start: currentPeriodStart,
          period_end: currentPeriodEnd,
          last_reset: new Date()
        });

        console.log(`[Admin] Granted £${amount} ${creditType} credits to ${authData.username}`);

        return res.status(200).json({
          success: true,
          message: `Granted £${amount} ${creditType} credits to ${authData.username}`
        });
      }

      return res.status(400).json({
        error: 'Invalid action',
        message: 'Supported actions: grant_credits'
      });

    } catch (error) {
      console.error('Error managing Twitch user credits:', error);
      return res.status(500).json({
        error: 'Failed to manage credits',
        message: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

module.exports = cors(requireAdmin(handler));