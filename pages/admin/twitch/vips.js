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

    // get vips from twitch api using pagination
    let allVips = [];
    let cursor = null;
    let totalCount = 0;

    do {
      const url = new URL('https://api.twitch.tv/helix/channels/vips');
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

      // Process VIPs data from this page
      const pageVips = data.data.map(vip => ({
        userId: vip.user_id,
        userLogin: vip.user_login,
        userName: vip.user_name
      }));

      allVips = allVips.concat(pageVips);
      totalCount = data.total || allVips.length;
      cursor = data.pagination?.cursor;

      console.log(`[Admin] Fetched ${pageVips.length} VIPs (${allVips.length}/${totalCount} total)`);

    } while (cursor && allVips.length < totalCount);

    const vips = allVips;

    // Get user profile images and additional info for each VIP (batch requests for large VIP lists)
    if (vips.length > 0) {
      const userProfiles = {};
      const userIds = vips.map(vip => vip.userId);

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
                createdAt: user.created_at,
                broadcasterType: user.broadcaster_type,
                description: user.description
              };
            });
          }
        } catch (error) {
          console.error(`Error fetching user profiles for VIP batch ${i}-${i + 100}:`, error);
        }
      }

      // Merge profile data with VIP data
      vips.forEach(vip => {
        if (userProfiles[vip.userId]) {
          vip.profileImageUrl = userProfiles[vip.userId].profileImageUrl;
          vip.displayName = userProfiles[vip.userId].displayName;
          vip.accountCreatedAt = userProfiles[vip.userId].createdAt;
          vip.broadcasterType = userProfiles[vip.userId].broadcasterType;
          vip.description = userProfiles[vip.userId].description;
        }
      });
    }

    console.log(`[Admin] Retrieved ${vips.length} VIPs for channel ${channelId}`);

    return res.status(200).json({
      success: true,
      vips: vips,
      total: totalCount,
      pagination: { cursor: null } // All data fetched
    });

  } catch (error) {
    console.error('Error fetching Twitch VIPs:', error);
    return res.status(500).json({
      error: 'Failed to fetch VIPs',
      message: error.message
    });
  }
}

module.exports = cors(requireAdmin(handler));