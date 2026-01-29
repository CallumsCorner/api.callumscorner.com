const db = require('../../lib/database'); 
const cors = require('../../lib/cors'); 
const { overlayOnly } = require('../../lib/auth');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const soundEffectsEnabled = await db.getSetting('soundEffectsEnabled');
    const activeSoundEffectId = await db.getSetting('activeSoundEffectId');
    const soundEffectVolume = await db.getSetting('soundEffectVolume');

    let activeSoundEffect = null;
    
    // Get active sound effect details if one is set
    if (soundEffectsEnabled === 'true' && activeSoundEffectId && activeSoundEffectId !== 'null') {
      activeSoundEffect = await db.getSoundEffectById(parseInt(activeSoundEffectId));
    }

    res.status(200).json({
      soundEffectsEnabled: soundEffectsEnabled === 'true',
      activeSoundEffectId: activeSoundEffectId !== 'null' ? parseInt(activeSoundEffectId) : null,
      soundEffectVolume: parseFloat(soundEffectVolume || '0.7'),
      activeSoundEffect: activeSoundEffect
    });
  } catch (error) {
    console.error('Sound settings error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(overlayOnly(handler));