const db = require('../../lib/database'); 
const cors = require('../../lib/cors'); 
const { requireAuth, adminOnly } = require('../../lib/auth');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log(`User '${req.user.username}' resumed the TTS.`);

    // Set resumed state
    await db.setSetting('isPaused', 'false');

    // Clear any intermediate processing flags
    await db.setSetting('currentlyPlaying', 'false');
    await db.setSetting('currentlyDisplaying', 'null');

    // Log if there's a donation that will be resumed
    const currentDonationId = await db.getSetting('currentDonationId');
    if (currentDonationId && currentDonationId !== 'null') {
      console.log(`[resume] Will restart donation ${currentDonationId} from the beginning`);
    }

    // Broadcast resume message to overlay
    if (global.broadcastToClients) {
      global.broadcastToClients({
        type: 'resume',
        timestamp: new Date().toISOString(),
        restartFromBeginning: true // Tell overlay to restart current donation from beginning
      });

      // Also trigger queue sync to wake up overlay
      global.broadcastToClients({
        type: 'donation-queue-updated',
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({ success: true, message: 'Donation alerts resumed' });
  } catch (error) {
    console.error('Resume error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(adminOnly(requireAuth(handler)));
