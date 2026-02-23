const { requireAdmin } = require('../../../lib/auth');
const db = require('../../../lib/database');
const cors = require('../../../lib/cors');

async function handler(req, res) {
  try {
    const { id } = req.params;

    if (req.method === 'GET') {
      const { source } = req.query; // 'queue' or 'history'

      let donation;
      if (source === 'queue') {
        donation = await db.getDonationFromQueue(id);
      } else {
        donation = await db.getDonationFromHistory(id);
      }

      if (!donation) {
        return res.status(404).json({ error: 'Donation not found' });
      }

      const wasNameFiltered = donation.name_was_filtered || (donation.originalName && donation.originalName !== donation.name);
      const wasMessageFiltered = donation.message_was_filtered || (donation.originalMessage && donation.originalMessage !== donation.message);

      let matchedWords = [];
      if (donation.filter_matched_words) {
        try {
          matchedWords = JSON.parse(donation.filter_matched_words);
        } catch (e) {
          matchedWords = [];
        }
      }

      return res.status(200).json({
        ...donation,
        filterInfo: {
          wasNameFiltered,
          wasMessageFiltered,
          originalName: donation.originalName || donation.name,
          originalMessage: donation.originalMessage || donation.message,
          matchedWords,
          reasoning: donation.filter_reasoning || null,
        }
      });

    } else if (req.method === 'PUT') {
      const { name, message, source } = req.body;
      const table = source === 'queue' ? 'DonationQueue' : 'DonationHistory';

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (message !== undefined) updates.message = message;

      const result = await db.updateDonation(table, id, updates);
      if (!result || result.length === 0) {
        return res.status(404).json({ error: 'Donation not found or no changes made' });
      }

      return res.status(200).json({ success: true, donation: result[0] });

    } else if (req.method === 'DELETE') {
      const removed = await db.removeDonationFromQueueAndStore(id);
      if (!removed) {
        return res.status(404).json({ error: 'Donation not found in queue' });
      }
      return res.status(200).json({ success: true, message: 'Donation removed from queue', donation: removed });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Donation detail error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = cors(requireAdmin(handler));
