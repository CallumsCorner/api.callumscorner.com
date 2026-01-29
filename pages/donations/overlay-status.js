const db = require('../../lib/database'); 
const cors = require('../../lib/cors'); 

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get only the information overlay needs (no auth required)
    const currentDonationId = await db.getSetting('currentDonationId');
    const isPaused = await db.getSetting('isPaused');
    const currentlyPlaying = await db.getSetting('currentlyPlaying');
    
    res.status(200).json({
      currentDonationId: currentDonationId !== 'null' ? parseInt(currentDonationId) : null,
      isPaused: isPaused === 'true',
      currentlyPlaying: currentlyPlaying === 'true'
    });
  } catch (error) {
    console.error('Overlay status error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(handler);
