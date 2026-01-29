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
    const sessionToken = req.cookies?.twitch_session;

    if (!sessionToken) {
      return res.status(200).json({
        authenticated: false,
        user: null,
        credits: null
      });
    }

    // Get user data from session token (this validates the session)
    const db = require('../../../lib/database');
    const authData = await db.getTwitchSessionUser(sessionToken);

    if (!authData) {
      // Clear invalid session cookie on parent domain
      const clearCookie = [
        'twitch_session=',
        'HttpOnly',
        'Path=/',
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'Domain=.callumscorner.com',
        'Secure',
        'SameSite=Lax'
      ].filter(Boolean).join('; ');
      res.setHeader('Set-Cookie', clearCookie);
      return res.status(200).json({
        authenticated: false,
        user: null,
        credits: null
      });
    }

    // Check if user is banned
    const twitchPayerId = `twitch_${authData.twitch_user_id}`;
    const isBanned = await db.isUserBanned(twitchPayerId);
    if (isBanned) {
      return res.status(200).json({
        authenticated: true,
        user: {
          id: authData.twitch_user_id,
          username: authData.username,
          displayName: authData.display_name,
          profileImageUrl: authData.profile_image_url,
          subscriberTier: authData.subscriber_tier,
          isVip: authData.is_vip,
          lastUpdated: authData.last_subscription_check,
          isBanned: true
        },
        credits: {
          total: 0,
          breakdown: { monthly_sub: 0, vip: 0, bits: 0 },
          period: null
        }
      });
    }

    //  check for credits
    const eligibleCredits = await calculateEligibleCredits(authData.subscriber_tier, authData.is_vip);
    const isEligibleForCredits = eligibleCredits.monthly_sub > 0 || eligibleCredits.vip > 0;

    // award credits if eligible and 30+ days have passed since last award
    if (isEligibleForCredits) {
      const canAwardCredits = await db.checkCreditAwardEligibility(authData.twitch_user_id);

      if (canAwardCredits) {
        console.log(`[twitch credit] User ${authData.username} eligible for credit award`);
        await db.awardCredits(authData.twitch_user_id, authData.subscriber_tier, authData.is_vip);
      }
    }

    // Get available credits
    const updatedCredits = await db.getTotalAvailableCredits(authData.id);

    // Get the next credit award date
    const nextCreditDate = await db.getNextCreditDate(authData.twitch_user_id);

    const creditPeriod = {
      type: 'accumulative',
      note: 'Credits never expire and accumulate over time. You need to open the donation page at least once a month for your credits to apply that month however.',
      nextCreditDate: nextCreditDate ? nextCreditDate.toISOString() : null
    };

    console.log(`User ${authData.username}: tier ${authData.subscriber_tier}, VIP: ${authData.is_vip}, credits: £${updatedCredits.total}`);

    // debug: Log the full user data being returned
    const userData = {
      id: authData.twitch_user_id,
      username: authData.username,
      displayName: authData.display_name,
      profileImageUrl: authData.profile_image_url,
      subscriberTier: authData.subscriber_tier,
      isVip: !!authData.is_vip, // Convert to bool
      odysee_access: !!authData.odysee_access, // Convert to bool
      lastUpdated: authData.updated_at
    };
    console.log('user data being returned:', JSON.stringify(userData, null, 2));

    return res.status(200).json({
      authenticated: true,
      user: userData,
      credits: {
        total: updatedCredits.total,
        breakdown: updatedCredits.breakdown,
        period: creditPeriod
      }
    });

  } catch (error) {
    console.error('Twitch status check error:', error);
    return res.status(500).json({
      error: 'Failed to check authentication status',
      message: error.message
    });
  }
}

// calculate eligible credits based on status
async function calculateEligibleCredits(subscriberTier, isVip) {
  const db = require('../../../lib/database');

  const tier1Amount = parseFloat(await db.getSetting('freeDonationTier1Amount')) || 3.00;
  const tier2Amount = parseFloat(await db.getSetting('freeDonationTier2Amount')) || 5.00;
  const tier3Amount = parseFloat(await db.getSetting('freeDonationTier3Amount')) || 10.00;
  const vipAmount = parseFloat(await db.getSetting('freeDonationVipAmount')) || 5.00;

  let eligible = {
    monthly_sub: 0,
    vip: 0,
    bits: 0 // TODO: Implement bits tracking
  };

  // Subscription credits
  switch (subscriberTier) {
    case 1:
      eligible.monthly_sub = tier1Amount;
      break;
    case 2:
      eligible.monthly_sub = tier2Amount;
      break;
    case 3:
      eligible.monthly_sub = tier3Amount;
      break;
    default:
      eligible.monthly_sub = 0;
  }

  // VIP credits
  if (isVip) {
    eligible.vip = vipAmount;
  }

  return eligible;
}

module.exports = cors(handler);