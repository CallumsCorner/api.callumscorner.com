const { requireAuth } = require('../../lib/auth'); 
const db = require('../../lib/database'); 
const cors = require('../../lib/cors'); 

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled parameter must be a boolean' });
    }

    // Set donation system enabled/disabled
    await db.setSetting('donationsEnabled', enabled.toString());

    // Also record when this was changed for capture-order validation
    if (!enabled) {
      await db.setSetting('donationsDisabledAt', new Date().toISOString());
    }

    // Broadcast settings update to overlay
    if (global.broadcastToClients) {
      global.broadcastToClients({
        type: 'settings-update',
        section: 'donations',
        settings: { donationsEnabled: enabled },
        timestamp: new Date().toISOString()
      });
    }

    res.status(200).json({ 
      success: true, 
      message: enabled ? 'Donations enabled' : 'Donations disabled',
      donationsEnabled: enabled
    });
  } catch (error) {
    console.error('Toggle donations error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAuth(handler));
