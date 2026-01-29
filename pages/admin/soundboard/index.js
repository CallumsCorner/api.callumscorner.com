const { requireAuth } = require('../../../lib/auth');
const db = require('../../../lib/database');
const cors = require('../../../lib/cors');
const fs = require('fs');
const path = require('path');

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Get all soundboard sounds
      const sounds = await db.getAllSoundboardSounds();
      res.status(200).json(sounds);

    } else if (req.method === 'DELETE') {
      // Delete soundboard sound
      const { id } = req.query;
      console.log('Request received for sound ID:', id);

      if (!id) {
        return res.status(400).json({ error: 'Sound ID is required' });
      }

      // Get sound info before deleting
      const sound = await db.getSoundboardSoundById(id);
      console.log('Sound found:', sound);

      if (!sound) {
        return res.status(404).json({ error: 'Sound not found' });
      }

      // Delete file from filesystem
      const filePath = path.join(process.cwd(), 'public', 'soundboard', sound.filename);
      console.log('Checking file path:', filePath);

      if (fs.existsSync(filePath)) {
        console.log('File exists, deleting...');
        fs.unlinkSync(filePath);
        console.log('File deleted successfully');
      } else {
        console.log('File does not exist');
      }

      // Delete from database
      console.log('Deleting from database...');
      await db.deleteSoundboardSound(id);
      console.log('Deleted from database successfully');

      res.status(200).json({ success: true, message: 'Sound deleted successfully' });

    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Soundboard API error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAuth(handler));
