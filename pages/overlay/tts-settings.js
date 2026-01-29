const db = require('../../lib/database'); 
const cors = require('../../lib/cors'); 
const { hiddenOnly } = require('../../lib/auth');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const ttsEnabled = await db.getSetting('ttsEnabled');
    const ttsVoice = await db.getSetting('ttsVoice');
    const ttsSpeed = await db.getSetting('ttsSpeed');
    const ttsPitch = await db.getSetting('ttsPitch');
    const ttsVolume = await db.getSetting('ttsVolume');
    const ttsReadNames = await db.getSetting('ttsReadNames');
    const ttsReadAmounts = await db.getSetting('ttsReadAmounts');
    const ttsReadMessages = await db.getSetting('ttsReadMessages');
    const ttsMaxMessageLength = await db.getSetting('ttsMaxMessageLength');
    const ttsLanguage = await db.getSetting('ttsLanguage');

    res.status(200).json({
      ttsEnabled: ttsEnabled === 'true',
      ttsVoice: ttsVoice || 'default',
      ttsSpeed: parseFloat(ttsSpeed || '1.0'),
      ttsPitch: parseFloat(ttsPitch || '1.0'),
      ttsVolume: parseFloat(ttsVolume || '0.8'),
      ttsReadNames: ttsReadNames === 'true',
      ttsReadAmounts: ttsReadAmounts === 'true',
      ttsReadMessages: ttsReadMessages === 'true',
      ttsMaxMessageLength: parseInt(ttsMaxMessageLength || '250'),
      ttsLanguage: ttsLanguage || 'en-GB'
    });
  } catch (error) {
    console.error('TTS settings error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(hiddenOnly(handler));
