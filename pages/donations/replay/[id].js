
const { requireAuth } = require('../../../lib/auth');
const db = require('../../../lib/database');
const cors = require('../../../lib/cors');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Increment replay counter (for rewind stats collection)
    db.query(`UPDATE Settings SET setting_value = setting_value + 1 WHERE setting_key = 'rewindReplayCount'`).catch(() => {});

    const { id } = req.params;
    const donationId = parseInt(id);
    if (!donationId) {
      return res.status(400).json({ error: 'Invalid donation ID' });
    }

    const donation = await db.getDonationFromHistory(donationId);
    if (!donation) {
      return res.status(404).json({ error: 'Donation not found in history' });
    }

    const replayOrderId = `${donation.order_id}_replay_${Date.now()}`;

    await db.addDonationToQueue({
      order_id: replayOrderId,
      name: donation.name,
      amount: donation.amount,
      message: donation.message,
      payer_id: donation.payer_id || null,
      is_replay: true
    });

    // Notify overlay that the queue has been updated
    if (global.broadcastToClients) {
      global.broadcastToClients({
        type: 'donation-queue-updated',
        newDonation: true,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({ success: true, message: 'Donation added to replay queue.' });
  } catch (error) {
    console.error('Replay error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAuth(handler));