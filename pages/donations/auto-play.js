const db = require('../../lib/database'); 
const cors = require('../../lib/cors'); 

// This endpoint will be called periodically to auto-play donations
async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // This endpoint is now just for backward compatibility
    // The overlay handles donation processing directly
    // this system suckkkkedddd and was way too clunky
    //decided to have the overlay be the single source of truth
    // prevents the classic streamelements issues of donations vanishing into thin air
    res.status(200).json({ 
      message: 'Auto-play now handled by overlay-driven system' 
    });
  } catch (error) {
    console.error('Auto-play error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(handler);
