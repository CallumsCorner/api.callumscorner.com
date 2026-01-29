const { requireAdmin } = require('../../../lib/auth'); 
const db = require('../../../lib/database'); 
const cors = require('../../../lib/cors'); 

async function handler(req, res) {
  try {
    const { id } = req.params;
    
    if (req.method === 'PUT') {
      // Update ban (notes, reason)
      const { reason, notes } = req.body;
      
      await db.query(
        'UPDATE BannedUsers SET reason = ?, notes = ?, updated_at = NOW() WHERE id = ?',
        [reason || '', notes || '', id]
      );
      
      res.status(200).json({ success: true, message: 'Ban updated successfully' });
      
    } else if (req.method === 'DELETE') {
      // Unban user
      await db.query('DELETE FROM BannedUsers WHERE id = ?', [id]);
      
      res.status(200).json({ success: true, message: 'User unbanned successfully' });
      
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Ban management error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAdmin(handler));
