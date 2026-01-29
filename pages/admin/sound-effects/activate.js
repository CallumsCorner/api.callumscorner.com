const { requireAuth } = require('../../../lib/auth'); 
const db = require('../../../lib/database'); 
const cors = require('../../../lib/cors'); 

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { soundEffectId } = req.body;

    // Validate sound effect exists (if not null/disable)
    if (soundEffectId && soundEffectId !== 'null') {
      const soundEffect = await db.getSoundEffectById(soundEffectId);
      if (!soundEffect) {
        return res.status(404).json({ error: 'Sound effect not found' });
      }
    }

    // Set as active
    await db.setActiveSoundEffect(soundEffectId);

    res.status(200).json({ 
      success: true, 
      message: soundEffectId === 'null' ? 'Sound effects disabled' : 'Sound effect activated successfully' 
    });
  } catch (error) {
    console.error('Activate sound effect error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAuth(handler));
