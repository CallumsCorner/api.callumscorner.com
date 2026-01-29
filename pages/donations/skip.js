const { requireAuth, adminOnly } = require('../../lib/auth');
const db = require('../../lib/database');
const cors = require('../../lib/cors');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log(`User '${req.user.username}' skipped the current donation.`);

    // Increment donation skip counter (for rewind stats collection)
    db.query(`UPDATE Settings SET setting_value = setting_value + 1 WHERE setting_key = 'rewindDonationSkipCount'`).catch(() => {});

    const currentDonationId = await db.getSetting('currentDonationId');

    if (currentDonationId && currentDonationId !== 'null') {
      // Immediately clear the server-side flags
      await db.setSetting('currentlyPlaying', 'false');
      await db.setSetting('currentlyDisplaying', 'null');
      
      if (global.broadcastToClients) {
        // Tell the overlay to stop its current process for this donation
        global.broadcastToClients({
          type: 'skip-current-donation',
          donationId: parseInt(currentDonationId),
          timestamp: new Date().toISOString(),
        });
        
        // Also broadcast to admin panel to update status immediately
        global.broadcastToClients({
          type: 'donation-skipped',
          donationId: parseInt(currentDonationId),
          timestamp: new Date().toISOString(),
        });
      }
      
      res.status(200).json({ success: true, message: 'Skip command sent to overlay.' });
    } else {
      res.status(200).json({ success: true, message: 'No active donation to skip.' });
    }
  } catch (error) {
    console.error('Skip error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(adminOnly(requireAuth(handler)));