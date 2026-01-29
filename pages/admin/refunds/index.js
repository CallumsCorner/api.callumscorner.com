const { requireAdmin } = require('../../../lib/auth');
const db = require('../../../lib/database');
const cors = require('../../../lib/cors');

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Get all refund requests
      const refundRequests = await db.getAllRefundRequests();
      res.status(200).json(refundRequests);
      
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Refunds API error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAdmin(handler));