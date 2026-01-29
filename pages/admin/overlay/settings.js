const { hiddenOnly } = require('../../../lib/auth');
const db = require('../../../lib/database');
const cors = require('../../../lib/cors');

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const twitchChatEnabled = await db.getSetting('twitchChatEnabled');
      const twitchChannelName = await db.getSetting('twitchChannelName');
      const chatProvider = await db.getSetting('chatProvider');
      const kickChannelName = await db.getSetting('kickChannelName');
      const twitchChatWidth = await db.getSetting('twitchChatWidth');
      const twitchChatHeight = await db.getSetting('twitchChatHeight');
      const twitchChatPositionX = await db.getSetting('twitchChatPositionX');
      const twitchChatPositionY = await db.getSetting('twitchChatPositionY');
      const nowPlayingWidth = await db.getSetting('nowPlayingWidth');
      const nowPlayingHeight = await db.getSetting('nowPlayingHeight');
      const nowPlayingPositionX = await db.getSetting('nowPlayingPositionX');
      const nowPlayingPositionY = await db.getSetting('nowPlayingPositionY');
      const donationAlertPositionX = await db.getSetting('donationAlertPositionX');
      const donationAlertPositionY = await db.getSetting('donationAlertPositionY');

      res.status(200).json({
        twitchChatEnabled: twitchChatEnabled === 'true',
        twitchChannelName: twitchChannelName || '',
        chatProvider: chatProvider || 'twitch',
        kickChannelName: kickChannelName || '',
        twitchChatWidth: parseInt(twitchChatWidth || '350'),
        twitchChatHeight: parseInt(twitchChatHeight || '600'),
        twitchChatPositionX: parseInt(twitchChatPositionX || '80'),
        twitchChatPositionY: parseInt(twitchChatPositionY || '95'),
        nowPlayingWidth: parseInt(nowPlayingWidth || '400'),
        nowPlayingHeight: parseInt(nowPlayingHeight || '80'),
        nowPlayingPositionX: parseInt(nowPlayingPositionX || '50'),
        nowPlayingPositionY: parseInt(nowPlayingPositionY || '95'),
        donationAlertPositionX: parseInt(donationAlertPositionX || '50'),
        donationAlertPositionY: parseInt(donationAlertPositionY || '50')
      });
      
    } else if (req.method === 'POST') {
      const {
        twitchChatEnabled, twitchChannelName, chatProvider, kickChannelName,
        twitchChatWidth, twitchChatHeight,
        twitchChatPositionX, twitchChatPositionY, nowPlayingWidth, nowPlayingHeight,
        nowPlayingPositionX, nowPlayingPositionY, donationAlertPositionX, donationAlertPositionY
      } = req.body;

      const updatedSettings = {};

      if (typeof twitchChatEnabled === 'boolean') {
        await db.setSetting('twitchChatEnabled', twitchChatEnabled.toString());
        updatedSettings.twitchChatEnabled = twitchChatEnabled;
      }

      if (typeof twitchChannelName === 'string') {
        await db.setSetting('twitchChannelName', twitchChannelName);
        updatedSettings.twitchChannelName = twitchChannelName;
      }

      if (typeof chatProvider === 'string' && ['twitch', 'kick'].includes(chatProvider)) {
        await db.setSetting('chatProvider', chatProvider);
        updatedSettings.chatProvider = chatProvider;
      }

      if (typeof kickChannelName === 'string') {
        await db.setSetting('kickChannelName', kickChannelName);
        updatedSettings.kickChannelName = kickChannelName;
      }

      if (typeof twitchChatWidth === 'number') {
        await db.setSetting('twitchChatWidth', twitchChatWidth.toString());
        updatedSettings.twitchChatWidth = twitchChatWidth;
      }

      if (typeof twitchChatHeight === 'number') {
        await db.setSetting('twitchChatHeight', twitchChatHeight.toString());
        updatedSettings.twitchChatHeight = twitchChatHeight;
      }

      if (typeof twitchChatPositionX === 'number') {
        await db.setSetting('twitchChatPositionX', twitchChatPositionX.toString());
        updatedSettings.twitchChatPositionX = twitchChatPositionX;
      }

      if (typeof twitchChatPositionY === 'number') {
        await db.setSetting('twitchChatPositionY', twitchChatPositionY.toString());
        updatedSettings.twitchChatPositionY = twitchChatPositionY;
      }

      if (typeof nowPlayingWidth === 'number') {
        await db.setSetting('nowPlayingWidth', nowPlayingWidth.toString());
        updatedSettings.nowPlayingWidth = nowPlayingWidth;
      }

      if (typeof nowPlayingHeight === 'number') {
        await db.setSetting('nowPlayingHeight', nowPlayingHeight.toString());
        updatedSettings.nowPlayingHeight = nowPlayingHeight;
      }

      if (typeof nowPlayingPositionX === 'number') {
        await db.setSetting('nowPlayingPositionX', nowPlayingPositionX.toString());
        updatedSettings.nowPlayingPositionX = nowPlayingPositionX;
      }

      if (typeof nowPlayingPositionY === 'number') {
        await db.setSetting('nowPlayingPositionY', nowPlayingPositionY.toString());
        updatedSettings.nowPlayingPositionY = nowPlayingPositionY;
      }
      
      if (typeof donationAlertPositionX === 'number') {
        await db.setSetting('donationAlertPositionX', donationAlertPositionX.toString());
        updatedSettings.donationAlertPositionX = donationAlertPositionX;
      }

      if (typeof donationAlertPositionY === 'number') {
        await db.setSetting('donationAlertPositionY', donationAlertPositionY.toString());
        updatedSettings.donationAlertPositionY = donationAlertPositionY;
      }


      if (global.broadcastToClients && Object.keys(updatedSettings).length > 0) {
        global.broadcastToClients({
          type: 'settings-update',
          section: 'overlay',
          settings: updatedSettings,
          timestamp: new Date().toISOString()
        });
      }

      res.status(200).json({ success: true, message: 'Overlay settings updated successfully' });
      
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Overlay settings error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(hiddenOnly(handler));