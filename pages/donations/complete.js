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

    // Get the currently displaying donation
    const currentDonationId = await db.getSetting('currentDonationId');
    const currentlyDisplaying = await db.getSetting('currentlyDisplaying');

    // Verify this matches what we expect
    if (currentDonationId !== donationId.toString()) {
      console.warn(`Donation ID mismatch on complete. Overlay Desync detected: expected ${currentDonationId}, got ${donationId}`);
      return res.status(400).json({ error: 'Donation ID mismatch. You attempted to mark a donation that is not currently playing as completed' });
    }

    // Get the donation from queue
    const queueResult = await db.query('SELECT * FROM DonationQueue WHERE id = ?', [parseInt(donationId)]);
    const donation = queueResult[0];
    
    if (!donation) {
      // Already processed, just clear flags
      await db.setSetting('currentlyDisplaying', 'null');
      await db.setSetting('currentlyPlaying', 'false');
      await db.setSetting('currentDonationId', 'null');
      
      return res.status(200).json({ 
        success: true, 
        message: 'Donation already completed, flags cleared' 
      });
    }

    // Clean the data
    const cleanName = String(donation.name || 'Anonymous').trim();
    const cleanMessage = String(donation.message || '').trim();
    const cleanAmount = parseFloat(donation.amount);
    const isReplay = Boolean(donation.is_replay);

    // Move to history (preserve original name and message from queue)
    await db.addDonationToHistory({
      order_id: donation.order_id,
      name: cleanName,
      amount: cleanAmount,
      message: cleanMessage,
      originalMessage: donation.originalMessage || cleanMessage,
      originalName: donation.originalName || cleanName,
      is_replay: isReplay,
      payer_id: donation.payer_id || null
    });
    
    // Remove from queue
    await db.removeDonationFromQueue(donation.id);
    
    // Clear all display flags
    await db.setSetting('currentlyDisplaying', 'null');
    await db.setSetting('currentlyPlaying', 'false');
    await db.setSetting('currentDonationId', 'null');

    console.log('Donation sequence completed manually:', {
      orderId: donation.order_id,
      name: cleanName,
      amount: cleanAmount
    });

    res.status(200).json({ 
      success: true, 
      message: 'Donation sequence completed successfully' 
    });
  } catch (error) {
    console.error('Complete donation error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(handler);
