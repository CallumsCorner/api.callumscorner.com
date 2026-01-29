const { createStripeSetupSession } = require('../../lib/stripe');
const cors = require('../../lib/cors');
const db = require('../../lib/database');

async function handler(req, res) {
  
  if (process.env.PAYMENT_PROCESSOR !== 'stripe') {
    return res.status(400).json({ error: 'Stripe payments are not enabled.' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount, name, message } = req.body;
    let { mediaUrl, mediaStartTime } = req.body;
    const MINIMUM_AMOUNT = 2.22;

    if (!amount || parseFloat(amount) < MINIMUM_AMOUNT) {
      return res.status(400).json({ error: `Invalid amount. Minimum is £${MINIMUM_AMOUNT.toFixed(2)}` });
    }

    if (message && message.length > 255) {
      return res.status(400).json({ error: 'Messages cannot exceed 255 characters. LWS, Frozen Bags and Tree discovered that they could on the 30/08/2025 stream. Their work will never be forgotten.' });
    }

    if (name && name.length > 22) {
      return res.status(400).json({ error: 'Your name cannot exceed 22 characters. This message is targeted to you GGHHGGHHGGHHGGHHGGHH.....' });
    }

    if (amount && amount > 1000000) {
      return res.status(400).json({ error: 'You cannot tip that much.' }); // unless youre jezzaman!!!!
    }

    const donationsEnabled = await db.getSetting('donationsEnabled');
    const mediaRequestsEnabled = await db.getSetting('mediaRequestsEnabled');

    if (donationsEnabled === 'false') {
      return res.status(400).json({ 
        error: 'Donations are currently disabled',
        code: 'DONATIONS_DISABLED'
      });
    }

    if (mediaRequestsEnabled === 'false') {
      mediaUrl = null;
      mediaStartTime = 0;
    }

    // Validate YouTube URL if provided
    if (mediaUrl) {
      const youtubePatterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /youtube\.com\/watch\?.*v=([^&\n?#]+)/
      ];

      let isValidYouTubeUrl = false;
      for (const pattern of youtubePatterns) {
        if (pattern.test(mediaUrl)) {
          isValidYouTubeUrl = true;
          break;
        }
      }

      if (!isValidYouTubeUrl) {
        return res.status(400).json({ error: 'Invalid YouTube URL. Please provide a valid YouTube video link or remove the Media Request.' });
      }
    }

    const stripeMetadata = {
      name: name || 'Anonymous',
      amount: amount.toString(),
      // The message is intentionally omitted here. Don't want Stripe to see Jezzaman's messages :)
      mediaUrl: mediaUrl || '',
      mediaStartTime: mediaStartTime ? mediaStartTime.toString() : '0',
    };

    // User banning is handled directly through Stripe's fraud prevention tools.
    // I could implement it here, but that would require the Customers:Read permission from Stripe,
    // which grants access to view customer personal information - so no.

    const session = await createStripeSetupSession(amount, 'gbp', stripeMetadata);

    if (!session || !session.id) {
      throw new Error('Failed to create Stripe Checkout session');
    }

    await db.query(
      'INSERT INTO DonationTemp (order_id, name, amount, message, media_url, media_start_time, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE name=VALUES(name), amount=VALUES(amount), message=VALUES(message), media_url=VALUES(media_url), media_start_time=VALUES(media_start_time)',
      [session.id, name || 'Anonymous', parseFloat(amount), message || '', mediaUrl, mediaStartTime || 0]
    );

    // Return only the URL that's needed for redirect
    res.status(200).json({ url: session.url });

  } catch (error) {
    console.error('Create Stripe session error:', error);
    res.status(500).json({ error: 'Failed to create payment session' });
  }
}

module.exports = cors(handler);