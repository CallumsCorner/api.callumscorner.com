const { getStripeSession, createChargeFromSetup, getStripeSetupIntent } = require('../../lib/stripe');
const db = require('../../lib/database'); 
const cors = require('../../lib/cors'); 

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
    const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    
    const response = await fetch(oEmbedUrl);
    if (response.ok) {
      const data = await response.json();
      console.log('YouTube metadata fetched:', data.title);
      return {
        title: data.title || `YouTube Video ${videoId}`,
        thumbnail: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/default.jpg`,
        duration: 0 // oEmbed doesn't provide duration cos its shit
      };
    }
  } catch (error) {
    console.error('Failed to get YouTube metadata from oEmbed:', error);
  }
  
  console.log('Using fallback metadata for video:', videoId);
  return {
    title: `YouTube Video ${videoId}`,
    thumbnail: `https://img.youtube.com/vi/${videoId}/default.jpg`,
    duration: 0
  };
};

async function handler(req, res) {

  return res.status(403).json({ error: 'This endpoint is currently disabled. I moved to using a Stripe webhook instead of users calling this directly with their payment ID. Basically, if you are seeing this then you are either using an outdated version of the frontend donate page which calls this endpoint, or you are being a nosy cont and calling random API endpoints. Ayup! ' });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const session = await getStripeSession(session_id);
    
    console.log('Stripe session retrieved:', {
      id: session?.id,
      payment_status: session?.payment_status,
      status: session?.status,
      mode: session?.mode,
      payment_intent: session?.payment_intent?.status
    });

    if (!session) {
      return res.status(400).json({ error: 'Session not found' });
    }
    
    const isPaymentSuccessful = session.payment_status === 'paid' || 
                               (session.payment_intent && session.payment_intent.status === 'succeeded');
    
    if (!isPaymentSuccessful) {
      console.log('Payment not successful:', {
        payment_status: session.payment_status,
        payment_intent_status: session.payment_intent?.status,
        session_status: session.status
      });
      return res.status(400).json({ error: 'Payment not successful' });
    }

    const orderID = session.id;

    const existingDonation = await db.checkOrderExists(orderID);

    if (existingDonation) {
      return res.status(400).json({ error: 'This payment has already been captured' });
    }

    const tempDonationResult = await db.query('SELECT * FROM DonationTemp WHERE order_id = ?', [orderID]);
    const tempDonation = tempDonationResult[0];

    if (!tempDonation) {
      return res.status(400).json({ error: 'Donation data not found for this session. It may have expired. You have not been charged.' });
    }

    if (!tempDonation) {
      return res.status(400).json({ error: 'Donation data not found for this session. It may have expired.' });
    }

    // Note: User banning is handled directly through Stripe's fraud prevention tools.
    // We could ban users here, but that would require the Customers Read permission,
    // which grants access to view customer personal information - not worth it.

    const donationData = {
      name: String(tempDonation.name || 'Anonymous').trim(),
      message: String(tempDonation.message || '').trim(),
      amount: parseFloat(tempDonation.amount),
      mediaUrl: tempDonation.media_url ? String(tempDonation.media_url).trim() : null,
      mediaStartTime: tempDonation.media_start_time ? parseInt(tempDonation.media_start_time) : 0,
    };

    if (isNaN(donationData.amount) || donationData.amount <= 0) {
      throw new Error('Invalid donation amount');
    }

    console.log('Cleaned donation data from Stripe:', donationData);

    const originalName = donationData.name;
    const originalMessage = donationData.message;
    const originalAmount = donationData.amount;
    const originalMediaUrl = donationData.mediaUrl;
    const originalMediaStartTime = donationData.mediaStartTime;

    await db.query('DELETE FROM DonationTemp WHERE order_id = ?', [orderID]);

    setImmediate(async () => {
      try {
        const [nameFilterResult, messageFilterResult] = await db.applyFilterBatch([
          originalName,
          originalMessage
        ]);

        await db.addDonationToLeaderboard(nameFilterResult.filtered, originalAmount);

        console.log(`Adding to queue - Filtered message: "${messageFilterResult.filtered}", Original message: "${originalMessage}"`);

        await db.addDonationToQueue({
          order_id: orderID,
          name: nameFilterResult.filtered,
          amount: originalAmount,
          message: messageFilterResult.filtered,
          originalMessage: originalMessage,
          is_replay: false
        });

        console.log(`Filtered and added donation ${orderID} to queue`);

        let mediaAdded = false;

        if (originalMediaUrl) {
          const videoId = extractYouTubeVideoId(originalMediaUrl);

          if (videoId) {
            const cleanMediaUrl = `https://www.youtube.com/watch?v=${videoId}`;
            const isVideoBanned = await db.isVideoBanned(videoId);

            if (isVideoBanned) {
              console.log('Video is banned, processing donation without media:', videoId);
            } else {
              try {
                const mediaMetadata = await getYouTubeMetadata(videoId);

                await db.addMediaToQueue({
                  order_id: orderID,
                  donor_name: nameFilterResult.filtered,
                  media_url: cleanMediaUrl,
                  media_start_time: originalMediaStartTime,
                  video_title: mediaMetadata.title,
                  is_replay: false
                });

                mediaAdded = true;
                if (global.broadcastToClients) {
                  global.broadcastToClients({
                    type: 'media-queue-updated',
                    newMedia: true,
                    timestamp: new Date().toISOString(),
                  });
                  console.log('Notified overlay of media queue update.');
                }
              } catch (mediaError) {
                console.error('Failed to add media to queue:', mediaError);
              }
            }
          }
        }

        if (global.broadcastToClients) {
          global.broadcastToClients({
            type: 'donation-queue-updated',
            newDonation: true,
            timestamp: new Date().toISOString(),
          });
        }

        console.log(`Complete for ${orderID}:`, {
          orderID,
          name: nameFilterResult.filtered,
          amount: originalAmount,
          mediaAdded
        });

      } catch (error) {
        console.error(`Failed to process donation ${orderID}:`, error);
      }
    });

    const responseData = {
      success: true,
      message: 'Payment captured successfully',
      donation: {
        orderID,
        amount: originalAmount,
        currency: 'GBP',
        name: originalName,
        message: originalMessage,
      },
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Capture Stripe order error:', error);

    if (error.type === 'StripeInvalidRequestError') {
      if (error.code === 'resource_missing') {
        return res.status(400).json({
          error: 'Invalid or expired session. The payment session could not be found. Please return to the donation page and try again.'
        });
      }
    }

    res.status(500).json({ error: 'Failed to process payment' });
  }
}

module.exports = cors(handler);