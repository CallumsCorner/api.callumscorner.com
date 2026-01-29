const { requireAdmin } = require('../../../lib/auth');
const db = require('../../../lib/database');
const cors = require('../../../lib/cors');

async function handler(req, res) {
  try {
    const { id } = req.params;
    
    if (req.method === 'PUT') {
      // Update refund request
      const { status, adminNotes } = req.body;
      
      const updates = {};
      if (status) updates.status = status;
      if (adminNotes !== undefined) updates.admin_notes = adminNotes;
      if (status === 'processed' || status === 'rejected') {
        updates.processed_at = new Date();
        updates.processed_by_user_id = req.user.user_id;
      }
      
      await db.updateRefundRequest(id, updates);
      
      console.log(`User '${req.user.username}' updated refund request ${id} to status: ${status}`);
      
      res.status(200).json({ success: true, message: 'Refund request updated successfully' });
      
    } else if (req.method === 'DELETE') {
      // Delete refund request
      await db.deleteRefundRequest(id);
      
      console.log(`User '${req.user.username}' deleted refund request ${id}`);
      
      res.status(200).json({ success: true, message: 'Refund request deleted successfully' });
      
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Refund management error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAdmin(handler));