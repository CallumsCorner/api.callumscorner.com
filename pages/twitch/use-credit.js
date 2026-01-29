const cors = require('../../lib/cors');
const twitchOAuth = require('../../lib/twitchOAuth');

// YouTube URL validation and metadata extraction
const extractYouTubeVideoId = (url) => {
  if (!url) return null;

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
};

const getYouTubeMetadata = async (videoId) => {
  try {
    // Try to get actual video title from YouTube API or oEmbed
    const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oEmbedUrl);

    if (response.ok) {
      const data = await response.json();
      return {
        title: data.title || `Video ID: ${videoId}`,
        thumbnail: data.thumbnail_url || '',
        duration: 0 // oEmbed doesn't provide duration cos its shit
      };
    }
  } catch (error) {
    console.warn('Failed to get YouTube metadata via oEmbed:', error);
  }

  // Fallback
  return {
    title: `Video ID: ${videoId}`,
    thumbnail: '',
    duration: 0
  };
};

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount, name, message, mediaUrl, mediaStartTime } = req.body;
    const sessionToken = req.cookies?.twitch_session;

    // Validate authentication
    if (!sessionToken) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please sign in with Twitch to use loyalty rewards'
      });
    }

    // Check if donations are enabled
    const db = require('../../lib/database');
    const donationsEnabled = await db.getSetting('donationsEnabled');
    const mediaRequestsEnabled = await db.getSetting('mediaRequestsEnabled');
    const twitchIntegrationEnabled = await db.getSetting('twitchIntegrationEnabled');

    if (twitchIntegrationEnabled !== 'true') {
      return res.status(403).json({
        error: 'Twitch Rewards are currently disabled',
        code: 'TWITCH_INTEGRATION_DISABLED'
      });
    }

    if (donationsEnabled === 'false') {
      return res.status(400).json({
        error: 'Donations are currently disabled',
        code: 'DONATIONS_DISABLED'
      });
    }

    // Validate amount
    const MINIMUM_AMOUNT = 2.22;
    const MAXIMUM_AMOUNT = 1000000;
    const donationAmount = parseFloat(amount);

    if (!donationAmount || donationAmount < MINIMUM_AMOUNT) {
      return res.status(400).json({
        error: `Invalid amount. Minimum is £${MINIMUM_AMOUNT.toFixed(2)}`
      });
    }

    if (donationAmount > MAXIMUM_AMOUNT) {
      return res.status(400).json({
        error: 'You cannot tip that much.'
      });
    }

    // Validate message length
    if (message && message.length > 255) {
      return res.status(400).json({
        error: 'Message cannot exceed 255 characters. LWS, Frozen Bags and Tree discovered that they could on the 30/08/2025 stream. Their work will never be forgotten.'
      });
    }

    // Validate name length
    if (name && name.length > 22) {
      return res.status(400).json({
        error: 'Your name cannot exceed 22 characters. This message is targeted to you GGHHGGHHGGHHGGHHGGHH.....'
      });
    }

    // Handle media requests based on enabled status
    let processedMediaUrl = mediaUrl;
    let processedMediaStartTime = mediaStartTime;

    if (mediaRequestsEnabled === 'false') {
      // If media requests are disabled, nullify any submitted media data
      processedMediaUrl = null;
      processedMediaStartTime = 0;
      console.log('Media requests are disabled, ignoring submitted media data');
    }

    // Validate YouTube URL if provided
    if (processedMediaUrl) {
      const youtubePatterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /youtube\.com\/watch\?.*v=([^&\n?#]+)/
      ];

      let isValidYouTubeUrl = false;
      for (const pattern of youtubePatterns) {
        if (pattern.test(processedMediaUrl)) {
          isValidYouTubeUrl = true;
          break;
        }
      }

      if (!isValidYouTubeUrl) {
        return res.status(400).json({ error: 'Invalid YouTube URL. Please provide a valid YouTube video link or remove the Media Request.' });
      }
    }

    // Get user authentication data from session
    const authData = await db.getTwitchSessionUser(sessionToken);
    if (!authData) {
      return res.status(401).json({
        error: 'Invalid authentication',
        message: 'Please sign in with Twitch again.'
      });
    }

    // Check if user is banned
    const twitchPayerId = `twitch_${authData.twitch_user_id}`;
    const isBanned = await db.isUserBanned(twitchPayerId);
    if (isBanned) {
      return res.status(403).json({
        error: 'Account banned',
        message: 'Your account has been banned from using Twitch rewards.'
      });
    }

    // Check available credits (accumulative across all periods)
    const availableCredits = await db.getTotalAvailableCredits(authData.id);

    if (availableCredits.total < donationAmount) {
      return res.status(400).json({
        error: 'Insufficient credits',
        message: `You have £${availableCredits.total.toFixed(2)} available, but tried to use £${donationAmount.toFixed(2)}. Nice try though!`,
        available: availableCredits.total,
        requested: donationAmount
      });
    }

    // Determine which credits to use (prioritize subscription credits first, then VIP)
    const creditsToUse = [];
    let remainingAmount = donationAmount;

    // Use subscription credits first
    if (availableCredits.breakdown.monthly_sub && remainingAmount > 0) {
      const useAmount = Math.min(availableCredits.breakdown.monthly_sub, remainingAmount);
      creditsToUse.push({ type: 'monthly_sub', amount: useAmount });
      remainingAmount -= useAmount;
    }

    // Use VIP credits next
    if (availableCredits.breakdown.vip && remainingAmount > 0) {
      const useAmount = Math.min(availableCredits.breakdown.vip, remainingAmount);
      creditsToUse.push({ type: 'vip', amount: useAmount });
      remainingAmount -= useAmount;
    }

    // Use bits credits next
    if (availableCredits.breakdown.bits && remainingAmount > 0) {
      const useAmount = Math.min(availableCredits.breakdown.bits, remainingAmount);
      creditsToUse.push({ type: 'bits', amount: useAmount });
      remainingAmount -= useAmount;
    }

    // Use minecraft credits last
    if (availableCredits.breakdown.minecraft && remainingAmount > 0) {
      const useAmount = Math.min(availableCredits.breakdown.minecraft, remainingAmount);
      creditsToUse.push({ type: 'minecraft', amount: useAmount });
      remainingAmount -= useAmount;
    }

    if (remainingAmount > 0) {
      return res.status(400).json({
        error: 'Credit calculation error',
        message: 'Unable to allocate sufficient credits'
      });
    }

    // Generate unique order ID for free donation
    const { v4: uuidv4 } = require('uuid');
    const orderId = `twitch_free_${uuidv4()}`;

    // Use the credits in database (accumulative system)
    const usageDetails = [];
    for (const credit of creditsToUse) {
      const creditUsage = await db.useFreeDonationCreditAccumulative(
        authData.id,
        credit.type,
        credit.amount
      );
      usageDetails.push({
        type: credit.type,
        amount: credit.amount,
        periods: creditUsage
      });
    }

    // Store original data for background processing
    const originalName = name || authData.display_name || authData.username;
    const originalMessage = message || '';

    console.log(`${authData.username} used £${donationAmount} in credits:`, usageDetails);

    // Process everything in background (non-blocking) - filtering AND queue addition
    setImmediate(async () => {
      try {
        // Apply filter to both name and message in a SINGLE AI request
        const [nameFilterResult, messageFilterResult] = await db.applyFilterBatch([
          originalName,
          originalMessage
        ]);

        // Add to donation queue with FILTERED data
        await db.addDonationToQueue({
          order_id: orderId,
          name: nameFilterResult.filtered,
          amount: donationAmount,
          message: messageFilterResult.filtered,
          originalMessage: originalMessage,
          originalName: originalName,
          payer_id: `twitch_${authData.twitch_user_id}`,
          is_replay: false
        });

        console.log(`Filtered and added Twitch reward ${orderId} to queue`);

        let mediaAdded = false;

        // Handle media request if provided
        if (processedMediaUrl) {
          const videoId = extractYouTubeVideoId(processedMediaUrl);

          if (videoId) {
            // Check if media requests are enabled
            const mediaEnabled = await db.getSetting('mediaRequestsEnabled');
            if (mediaEnabled !== 'true') {
              console.log('Media requests are disabled, processing loyalty reward without media');
            } else {
              const cleanMediaUrl = `https://www.youtube.com/watch?v=${videoId}`;

              // Check if video is banned
              const isVideoBanned = await db.isVideoBanned(videoId);

              if (isVideoBanned) {
                console.log('Video is banned, processing loyalty reward without media:', videoId);
              } else {
                // Normal flow - add to media queue with metadata
                try {
                  const mediaMetadata = await getYouTubeMetadata(videoId);

                  await db.addMediaToQueue({
                    order_id: orderId,
                    donor_name: nameFilterResult.filtered,
                    media_url: cleanMediaUrl,
                    media_start_time: parseInt(processedMediaStartTime) || 0,
                    video_title: mediaMetadata.title,
                    payer_id: `twitch_${authData.twitch_user_id}`,
                    is_replay: false
                  });

                  mediaAdded = true;
                  if (global.broadcastToClients) {
                    global.broadcastToClients({
                      type: 'media-queue-updated',
                      newMedia: true,
                      timestamp: new Date().toISOString(),
                    });
                    console.log('Notified overlay of media queue update from Twitch loyalty reward.');
                  }
                } catch (mediaError) {
                  console.error('Failed to add Twitch loyalty reward media to queue:', mediaError);
                }
              }
            }
          }
        }

        // Broadcast to overlay
        if (global.broadcastToClients) {
          global.broadcastToClients({
            type: 'new_donation',
            data: {
              id: orderId,
              name: nameFilterResult.filtered,
              amount: donationAmount,
              message: messageFilterResult.filtered,
              isFree: true,
              via: 'twitch'
            }
          });
        }

        console.log(`Complete for Twitch reward ${orderId}:`, {
          orderId,
          name: nameFilterResult.filtered,
          amount: donationAmount,
          mediaAdded
        });

      } catch (error) {
        console.error(`Failed to process Twitch reward ${orderId}:`, error);
      }
    });

    // Return success immediately without waiting for processing
    const responseData = {
      success: true,
      orderId: orderId,
      amount: donationAmount,
      creditsUsed: creditsToUse,
      usageDetails: usageDetails,
      message: 'Loyalty reward successfully processed!'
    };

    return res.status(200).json(responseData);

  } catch (error) {
    console.error('Twitch free donation error:', error);
    return res.status(500).json({
      error: 'Failed to process loyalty reward',
      message: error.message
    });
  }
}

module.exports = cors(handler);