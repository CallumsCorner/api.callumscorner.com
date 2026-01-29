const db = require('../../lib/database');
const cors = require('../../lib/cors');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { orderId, reason, additionalInfo } = req.body;

    if (!orderId || !orderId.trim()) {
      return res.status(400).json({ error: 'Order number is required' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'Reason for refund is required' });
    }

    const cleanOrderId = orderId.trim();
    const cleanReason = reason.trim();
    const cleanAdditionalInfo = additionalInfo ? additionalInfo.trim() : null;

    await db.createRefundRequest(
      cleanOrderId,
      cleanReason,
      cleanAdditionalInfo
    );
    
    res.status(200).json({
      success: true,
      message: 'Refund request submitted successfully'
    });
  } catch (error) {
    console.error('Refund request error:', error);
    res.status(500).json({ error: 'Failed to submit refund request' });
  }
}

module.exports = cors(handler);