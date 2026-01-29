const cors = require('../../../lib/cors');
const { requireAdmin } = require('../../../lib/auth');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const clientId = process.env.TWITCH_BROADCASTER_CLIENT_ID;
    const accessToken = process.env.TWITCH_BROADCASTER_ACCESS_TOKEN;
    const channelId = process.env.TWITCH_CHANNEL_ID;

    if (!clientId || !accessToken || !channelId) {
      return res.status(500).json({
        error: 'Twitch configuration incomplete',
        message: 'Missing required Twitch credentials'
      });
    }

    // Get ALL subscribers from Twitch API with pagination
    let allSubscribers = [];
    let cursor = null;
    let totalCount = 0;

    do {
      const url = new URL('https://api.twitch.tv/helix/subscriptions');
      url.searchParams.append('broadcaster_id', channelId);
      url.searchParams.append('first', '100'); // Max per request
      if (cursor) {
        url.searchParams.append('after', cursor);
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Client-Id': clientId
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Twitch access token expired or invalid'
          });
        }
        throw new Error(`Twitch API error: ${response.status}`);
      }

      const data = await response.json();

      // Process subscribers data from this page
      const pageSubscribers = data.data.map(sub => ({
        userId: sub.user_id,
        userLogin: sub.user_login,
        userName: sub.user_name,
        tier: sub.tier,
        planName: sub.plan_name,
        isGift: sub.is_gift,
        gifterLogin: sub.gifter_login,
        gifterName: sub.gifter_name,
        createdAt: sub.created_at
      }));

      allSubscribers = allSubscribers.concat(pageSubscribers);
      totalCount = data.total || allSubscribers.length;
      cursor = data.pagination?.cursor;

      console.log(`[Admin] Fetched ${pageSubscribers.length} subscribers (${allSubscribers.length}/${totalCount} total)`);

    } while (cursor && allSubscribers.length < totalCount);

    const subscribers = allSubscribers;

    // Get user profile images for each subscriber (batch requests for large subscriber lists)
    if (subscribers.length > 0) {
      const userProfiles = {};
      const userIds = subscribers.map(sub => sub.userId);

      // Process in batches of 100 (Twitch API limit)
      for (let i = 0; i < userIds.length; i += 100) {
        const batchIds = userIds.slice(i, i + 100);
        const idsParam = batchIds.join('&id=');

        try {
          const usersResponse = await fetch(`https://api.twitch.tv/helix/users?id=${idsParam}`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Client-Id': clientId
            }
          });

          if (usersResponse.ok) {
            const usersData = await usersResponse.json();

            usersData.data.forEach(user => {
              userProfiles[user.id] = {
                profileImageUrl: user.profile_image_url,
                displayName: user.display_name,
                createdAt: user.created_at
              };
            });
          }
        } catch (error) {
          console.error(`Error fetching user profiles for batch ${i}-${i + 100}:`, error);
        }
      }

      // Merge profile data with subscriber data
      subscribers.forEach(sub => {
        if (userProfiles[sub.userId]) {
          sub.profileImageUrl = userProfiles[sub.userId].profileImageUrl;
          sub.displayName = userProfiles[sub.userId].displayName;
          sub.accountCreatedAt = userProfiles[sub.userId].createdAt;
        }
      });
    }

    console.log(`[Admin] Retrieved ${subscribers.length} subscribers for channel ${channelId}`);

    return res.status(200).json({
      success: true,
      subscribers: subscribers,
      total: totalCount,
      pagination: { cursor: null } // All data fetched
    });

  } catch (error) {
    console.error('Error fetching Twitch subscribers:', error);
    return res.status(500).json({
      error: 'Failed to fetch subscribers',
      message: error.message
    });
  }
}

module.exports = cors(requireAdmin(handler));