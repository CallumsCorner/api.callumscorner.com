const { requireAuth } = require('../../lib/auth'); 
const db = require('../../lib/database'); 
const cors = require('../../lib/cors'); 

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get current settings
    const isPaused = await db.getSetting('isPaused');
    const currentlyDisplaying = await db.getSetting('currentlyDisplaying');
    const currentlyPlaying = await db.getSetting('currentlyPlaying');
    const currentDonationId = await db.getSetting('currentDonationId');
    
    // Get current donation details if one is displaying AND currently playing
    let currentDonation = null;
    if (currentDonationId && currentDonationId !== 'null' && currentlyPlaying === 'true') {
      const donationResult = await db.query('SELECT * FROM DonationQueue WHERE id = ?', [parseInt(currentDonationId)]);
      if (donationResult.length > 0) {
        const rawDonation = donationResult[0];

        // Clean the data explicitly to prevent any contamination
        currentDonation = {
          id: rawDonation.id,
          order_id: rawDonation.order_id,
          name: String(rawDonation.name).trim(),
          amount: parseFloat(rawDonation.amount),
          message: rawDonation.message ? String(rawDonation.message).trim() : '',
          is_replay: Boolean(rawDonation.is_replay),
          created_at: rawDonation.created_at
        };
      }
    }

    const currentlyPlayingMedia = await db.getSetting('currentlyPlayingMedia');
    const currentMediaId = await db.getSetting('currentMediaId');
    let currentMedia = null;
    if (currentlyPlayingMedia === 'true' && currentMediaId && currentMediaId !== 'null') {
        const mediaResult = await db.query('SELECT * FROM MediaQueue WHERE id = ?', [parseInt(currentMediaId)]);
        if (mediaResult.length > 0) {
            currentMedia = mediaResult[0];
        }
    }
    const mediaPaused = await db.getSetting('mediaPaused');
    
    const userResponse = {
      id: req.user.user_id,
      username: req.user.username,
      role: req.user.role,
    };

    const settings = {
      isPaused: isPaused === 'true',
      currentlyDisplaying: currentlyDisplaying && currentlyDisplaying !== 'null' ? currentlyDisplaying : null,
      currentlyPlaying: currentlyPlaying === 'true',
      currentDonation: currentDonation,
    };

    res.status(200).json({
      user: userResponse,
      settings,
      currentMedia: currentMedia,
      mediaPaused: mediaPaused === 'true',
    });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAuth(handler));
