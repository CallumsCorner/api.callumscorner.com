const { requireAuth } = require('../../../lib/auth'); 
const db = require('../../../lib/database'); 
const cors = require('../../../lib/cors'); 

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Get TTS settings
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
      const ttsQuality = await db.getSetting('ttsQuality');
      const ttsProvider = await db.getSetting('ttsProvider');

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
        ttsLanguage: ttsLanguage || 'en-GB',
        ttsQuality: ttsQuality || 'high',
        ttsProvider: ttsProvider || 'auto'
      });
      
    } else if (req.method === 'POST') {
      // Update TTS settings
      const { 
        ttsEnabled, 
        ttsVoice, 
        ttsSpeed, 
        ttsPitch, 
        ttsVolume,
        ttsReadNames,
        ttsReadAmounts, 
        ttsReadMessages,
        ttsMaxMessageLength,
        ttsLanguage,
        ttsQuality,
        ttsProvider
      } = req.body;

      const updatedSettings = {};

      // Validate and update each setting
      if (typeof ttsEnabled === 'boolean') {
        await db.setSetting('ttsEnabled', ttsEnabled.toString());
        updatedSettings.ttsEnabled = ttsEnabled;
      }
      
      if (ttsVoice && typeof ttsVoice === 'string') {
        await db.setSetting('ttsVoice', ttsVoice);
        updatedSettings.ttsVoice = ttsVoice;
      }
      
      if (typeof ttsSpeed === 'number' && ttsSpeed >= 0.1 && ttsSpeed <= 2.0) {
        await db.setSetting('ttsSpeed', ttsSpeed.toString());
        updatedSettings.ttsSpeed = ttsSpeed;
      }
      
      if (typeof ttsPitch === 'number' && ttsPitch >= 0.1 && ttsPitch <= 2.0) {
        await db.setSetting('ttsPitch', ttsPitch.toString());
        updatedSettings.ttsPitch = ttsPitch;
      }
      
      if (typeof ttsVolume === 'number' && ttsVolume >= 0 && ttsVolume <= 1) {
        await db.setSetting('ttsVolume', ttsVolume.toString());
        updatedSettings.ttsVolume = ttsVolume;
      }
      
      if (typeof ttsReadNames === 'boolean') {
        await db.setSetting('ttsReadNames', ttsReadNames.toString());
        updatedSettings.ttsReadNames = ttsReadNames;
      }
      
      if (typeof ttsReadAmounts === 'boolean') {
        await db.setSetting('ttsReadAmounts', ttsReadAmounts.toString());
        updatedSettings.ttsReadAmounts = ttsReadAmounts;
      }
      
      if (typeof ttsReadMessages === 'boolean') {
        await db.setSetting('ttsReadMessages', ttsReadMessages.toString());
        updatedSettings.ttsReadMessages = ttsReadMessages;
      }
      
      if (typeof ttsMaxMessageLength === 'number' && ttsMaxMessageLength >= 50 && ttsMaxMessageLength <= 1000) {
        await db.setSetting('ttsMaxMessageLength', ttsMaxMessageLength.toString());
        updatedSettings.ttsMaxMessageLength = ttsMaxMessageLength;
      }
      
      if (ttsLanguage && typeof ttsLanguage === 'string') {
        await db.setSetting('ttsLanguage', ttsLanguage);
        updatedSettings.ttsLanguage = ttsLanguage;
      }
      
      if (ttsQuality && ['standard', 'high', 'premium'].includes(ttsQuality)) {
        await db.setSetting('ttsQuality', ttsQuality);
        updatedSettings.ttsQuality = ttsQuality;
      }
      
      if (ttsProvider && ['auto', 'polly', 'google', 'browser'].includes(ttsProvider)) {
        await db.setSetting('ttsProvider', ttsProvider);
        updatedSettings.ttsProvider = ttsProvider;
      }

      // Broadcast settings update to overlay
      if (global.broadcastToClients && Object.keys(updatedSettings).length > 0) {
        global.broadcastToClients({
          type: 'settings-update',
          section: 'tts',
          settings: updatedSettings,
          timestamp: new Date().toISOString()
        });
      }

      res.status(200).json({ success: true, message: 'TTS settings updated successfully' });
      
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('TTS settings error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAuth(handler));
