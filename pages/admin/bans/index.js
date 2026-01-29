//this isnt really used anymore
//since Stripe doesnt provide an alternative to payer_id without directly
//exposing customer information. so bans are now done via stripe's "block list", handled by cal manually
const { requireAdmin } = require('../../../lib/auth'); 
const db = require('../../../lib/database'); 
const cors = require('../../../lib/cors'); 

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Get all banned users
      const bannedUsers = await db.query(`
        SELECT b.*, u.username as banned_by_username 
        FROM BannedUsers b 
        JOIN Users u ON b.banned_by_user_id = u.id 
        ORDER BY b.banned_at DESC
      `);
      
      res.status(200).json(bannedUsers);
      
    } else if (req.method === 'POST') {
      // Ban a user
      const { payer_id, donor_name, reason, notes } = req.body;
      
      if (!payer_id || !donor_name) {
        return res.status(400).json({ error: 'Payer ID and donor name are required' });
      }
      
      // Check if already banned
      const existing = await db.query('SELECT id FROM BannedUsers WHERE payer_id = ?', [payer_id]);
      if (existing.length > 0) {
        return res.status(400).json({ error: 'User is already banned' });
      }
      
      await db.query(
        'INSERT INTO BannedUsers (payer_id, donor_name, reason, notes, banned_by_user_id) VALUES (?, ?, ?, ?, ?)',
        [payer_id, donor_name, reason || 'Inappropriate content', notes || '', req.user.user_id]
      );
      
      res.status(201).json({ success: true, message: 'User banned successfully' });
      
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Ban management error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAdmin(handler));
