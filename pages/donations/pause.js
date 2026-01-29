const { requireAuth, adminOnly } = require('../../lib/auth');
const db = require('../../lib/database');
const cors = require('../../lib/cors');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log(`User '${req.user.username}' paused TTS.`);
    // Set paused state first
    await db.setSetting('isPaused', 'true');

    // Check if a donation is currently playing and stop it (but keep in queue)
    const currentDonationId = await db.getSetting('currentDonationId');
    if (currentDonationId && currentDonationId !== 'null') {
      console.log(`[pause] Keeping donation ${currentDonationId} in queue for resume`);
      // Don't move to history, just clear processing flags so it stays in queue
    }

    // Clear all donation-related processing flags but keep currentDonationId for resume
    await db.setSetting('currentlyPlaying', 'false');
    await db.setSetting('currentlyDisplaying', 'null');
    // Note: Keep currentDonationId so we know what to resume
    console.log(`[pause] Cleared processing flags but kept currentDonationId for resume`);

    // Notify overlay to stop immediately
    if (global.broadcastToClients) {
      global.broadcastToClients({
        type: 'pause-donation-processing',
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({ success: true, message: 'Donation alerts paused and cleared.' });
  } catch (error) {
    console.error('Pause error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(adminOnly(requireAuth(handler)));