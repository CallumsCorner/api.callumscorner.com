const { requireAdmin } = require('../../../../lib/auth'); 
const db = require('../../../../lib/database'); 
const cors = require('../../../../lib/cors'); 

async function handler(req, res) {
  try {
    const { id } = req.params;
    
    if (req.method === 'PUT') {
      const { reason, notes } = req.body;
      
      await db.updateVideoBan(id, {
        reason: reason || '',
        notes: notes || ''
      });
      
      res.status(200).json({ success: true, message: 'Video ban updated successfully' });
      
    } else if (req.method === 'DELETE') {
      await db.deleteVideoBan(id);
      
      res.status(200).json({ success: true, message: 'Video unbanned successfully' });
      
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Video ban management error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAdmin(handler));
