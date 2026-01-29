const { overlayOnly } = require('../../lib/auth'); 
const db = require('../../lib/database'); 
const cors = require('../../lib/cors'); 

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { donationId } = req.body;

    if (!donationId) {
      return res.status(400).json({ error: 'Donation ID is required' });
    }

    // check if donations are paused
    const isPaused = await db.getSetting('isPaused');
    if (isPaused === 'true') {
      return res.status(400).json({ 
        error: 'Donations are currently paused',
        paused: true
      });
    }

    // Check if another donation is already being processed
    const currentlyPlaying = await db.getSetting('currentlyPlaying');
    const currentDonationId = await db.getSetting('currentDonationId');
    
    if (currentlyPlaying === 'true' && currentDonationId !== 'null' && currentDonationId !== donationId.toString()) {
      console.warn(`Attempt to start processing donation ${donationId} while donation ${currentDonationId} is already being processed. Potential overlay desync.`);
      return res.status(400).json({ 
        error: 'Another donation is currently being processed',
        currentDonationId: parseInt(currentDonationId)
      });
    }

    // Mark donation as currently being processed
    await db.setSetting('currentlyPlaying', 'true');
    await db.setSetting('currentDonationId', donationId.toString());

    // get the detais
    const donation = await db.query('SELECT * FROM DonationQueue WHERE id = ?', [donationId]);
    if (donation.length > 0) {
      await db.setSetting('currentlyDisplaying', donation[0].order_id);
    }

    // broadcast
    if (global.broadcastToClients) {
      global.broadcastToClients({
        type: 'donation-processing-started',
        donationId: donationId,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Donation processing started',
      donationId: donationId
    });
  } catch (error) {
    console.error('Start processing donation error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(overlayOnly(handler));
