const { createPayPalOrder } = require('../../lib/paypal');
const cors = require('../../lib/cors'); 

async function handler(req, res) {
  if (process.env.PAYMENT_PROCESSOR !== 'paypal') {
    return res.status(400).json({ error: 'PayPal payments are not enabled.' });
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
      return res.status(400).json({ error: 'You cannot tip that much.' });
    }

    // Check if donos and media are enabled
    const db = require('../../lib/database');
    const donationsEnabled = await db.getSetting('donationsEnabled');
    const mediaRequestsEnabled = await db.getSetting('mediaRequestsEnabled');

    if (donationsEnabled === 'false') {
      return res.status(400).json({ 
        error: 'Donations are currently disabled',
        code: 'DONATIONS_DISABLED'
      });
    }

    // If media is disabled, nullify any submitted media data
    if (mediaRequestsEnabled === 'false') {
      mediaUrl = null;
      mediaStartTime = 0;
    }

    // Validate media URL if provided
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

    // Create PayPal order
    const order = await createPayPalOrder(amount, 'GBP');

    if (!order || !order.id) {
      throw new Error('Failed to create PayPal order');
    }

    // Store the donation details in database temporarily with the order ID
    // Clean the data to ensure no extra characters
    const cleanName = (name || 'Anonymous').toString().trim();
    const cleanMessage = (message || '').toString().trim();
    const cleanAmount = parseFloat(amount);
    const cleanMediaUrl = mediaUrl ? mediaUrl.toString().trim() : null;
    const cleanMediaStartTime = mediaStartTime ? parseInt(mediaStartTime) : 0;
    
    console.log('Storing donation data:', { 
      orderID: order.id, 
      name: cleanName, 
      amount: cleanAmount, 
      message: cleanMessage,
      mediaUrl: cleanMediaUrl,
      mediaStartTime: cleanMediaStartTime
    });
        
    // Delete any existing temp data for this order (shouldn't happen but just in case)
    await db.query('DELETE FROM DonationTemp WHERE order_id = ?', [order.id]);
    
    // Insert the clean data with explicit types
    await db.query(
      'INSERT INTO DonationTemp (order_id, name, amount, message, media_url, media_start_time, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [order.id, cleanName, cleanAmount, cleanMessage, cleanMediaUrl, cleanMediaStartTime]
    );

    res.status(200).json(order);
  } catch (error) {
    console.error('Create PayPal order error:', error);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
}

module.exports = cors(handler);
