const { requireAuth } = require('../../../lib/auth'); 
const db = require('../../../lib/database'); 
const cors = require('../../../lib/cors'); 
const fs = require('fs');
const path = require('path');

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Get all sound effects
      const soundEffects = await db.getAllSoundEffects();
      res.status(200).json(soundEffects);
      
    } else if (req.method === 'DELETE') {
      // Delete sound effect
      const { id } = req.query;
      
      if (!id) {
        return res.status(400).json({ error: 'Sound effect ID is required' });
      }

      // Get sound effect info before deleting
      const soundEffect = await db.getSoundEffectById(id);
      if (!soundEffect) {
        return res.status(404).json({ error: 'Sound effect not found' });
      }

      // Delete file from filesystem
      const filePath = path.join(process.cwd(), 'public', 'uploads', 'sounds', soundEffect.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Delete from database
      await db.deleteSoundEffect(id);

      res.status(200).json({ success: true, message: 'Sound effect deleted successfully' });
      
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Sound effects API error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAuth(handler));
