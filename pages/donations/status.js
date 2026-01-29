const db = require('../../lib/database'); 
const cors = require('../../lib/cors'); 

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const donationsEnabled = await db.getSetting('donationsEnabled');
    
    res.status(200).json({
      donationsEnabled: donationsEnabled !== 'false', // Default to true if not set
    });
  } catch (error) {
    console.error('Get donations status error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(handler);
