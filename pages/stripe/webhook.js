const db = require('../../lib/database');

async function handler(req, res) {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  console.log(`Received event: ${event.type}`);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    if (session.payment_status === 'paid') {
      console.log(`Processing payment: ${session.id}`);

      try {
        // check if already processed
        const existingDonation = await db.checkOrderExists(session.id);
        if (existingDonation) {
          console.log(`Order ${session.id} already processed`);
          return res.status(200).json({ received: true });
        }

        // get donation data from temp table
        const tempDonationResult = await db.query('SELECT * FROM DonationTemp WHERE order_id = ?', [session.id]);
        const tempDonation = tempDonationResult[0];

        if (!tempDonation) {
          console.error(`No temp donation found for ${session.id}`);
          return res.status(200).json({ received: true });
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

        // delete from temp table
        await db.query('DELETE FROM DonationTemp WHERE order_id = ?', [session.id]);

        // process in background
        setImmediate(async () => {
          try {
            const [nameFilterResult, messageFilterResult] = await db.applyFilterBatch([
              donationData.name,
              donationData.message
            ]);

            await db.addDonationToLeaderboard(nameFilterResult.filtered, donationData.amount);

            await db.addDonationToQueue({
              order_id: session.id,
              name: nameFilterResult.filtered,
              amount: donationData.amount,
              message: messageFilterResult.filtered,
              originalMessage: donationData.message,
              is_replay: false
            });

            let mediaAdded = false;

            if (donationData.mediaUrl) {
              const videoIdMatch = donationData.mediaUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
              const videoId = videoIdMatch ? videoIdMatch[1] : null;

              if (videoId) {
                const isVideoBanned = await db.isVideoBanned(videoId);
                if (!isVideoBanned) {
                  let videoTitle = `YouTube Video ${videoId}`;
                  try {
                    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
                    if (oembedRes.ok) {
                      const oembedData = await oembedRes.json();
                      videoTitle = oembedData.title || videoTitle;
                    }
                  } catch (e) {}

                  await db.addMediaToQueue({
                    order_id: session.id,
                    donor_name: nameFilterResult.filtered,
                    media_url: `https://www.youtube.com/watch?v=${videoId}`,
                    media_start_time: donationData.mediaStartTime,
                    video_title: videoTitle,
                    is_replay: false
                  });
                  mediaAdded = true;
                }
              }
            }

            if (global.broadcastToClients) {
              global.broadcastToClients({ type: 'donation-queue-updated', newDonation: true, timestamp: new Date().toISOString() });
              if (mediaAdded) {
                global.broadcastToClients({ type: 'media-queue-updated', newMedia: true, timestamp: new Date().toISOString() });
              }
            }

            console.log(`Processed donation ${session.id}`);
          } catch (error) {
            console.error(`Processing error for ${session.id}:`, error);
          }
        });

      } catch (error) {
        console.error(`Error processing ${session.id}:`, error);
      }
    }
  }

  res.status(200).json({ received: true });
}

module.exports = handler;
