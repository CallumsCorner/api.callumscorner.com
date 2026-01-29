const db = require('../../lib/database'); 
const cors = require('../../lib/cors'); 

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const mediaRequestsEnabled = await db.getSetting('mediaRequestsEnabled');
    
    res.status(200).json({
      mediaRequestsEnabled: mediaRequestsEnabled === 'true', // Default to true if not set
    });
  } catch (error) {
    console.error('Get media enabled status error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(handler);