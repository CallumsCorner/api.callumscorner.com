const cors = require('../../../lib/cors');
const { requireAdmin } = require('../../../lib/auth');

async function handler(req, res) {
  const db = require('../../../lib/database');

  if (req.method === 'GET') {
    try {
      // Get all Twitch-related settings
      const settings = {};
      const twitchSettings = [
        'twitchIntegrationEnabled',
        'twitchClientId',
        'twitchChannelId',
        'freeDonationTier1Amount',
        'freeDonationTier2Amount',
        'freeDonationTier3Amount',
        'freeDonationVipAmount',
        'freeDonationBitsRatio',
        'chatProvider',
        'kickChannelName',
        'kickApiToken',
        // EventSub Alert Settings
        'eventsubAlertsEnabled',
        'eventsubSubscriptionAlerts',
        'eventsubGiftSubAlerts',
        'eventsubCheerAlerts',
        'eventsubFollowAlerts',
        'eventsubRaidAlerts',
        'eventsubWebhookSecret'
      ];

      for (const setting of twitchSettings) {
        settings[setting] = await db.getSetting(setting);
      }

      return res.status(200).json({
        success: true,
        settings: settings
      });

    } catch (error) {
      console.error('Error fetching Twitch settings:', error);
      return res.status(500).json({
        error: 'Failed to fetch settings',
        message: error.message
      });
    }
  }

  if (req.method === 'POST') {
    try {
      const { settings } = req.body;

      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({
          error: 'Invalid settings data',
          message: 'Settings object is required'
        });
      }

      // Validate settings
      const validSettings = [
        'twitchIntegrationEnabled',
        'twitchClientId',
        'twitchChannelId',
        'freeDonationTier1Amount',
        'freeDonationTier2Amount',
        'freeDonationTier3Amount',
        'freeDonationVipAmount',
        'freeDonationBitsRatio',
        'chatProvider',
        'kickChannelName',
        'kickApiToken',
        // EventSub Alert Settings
        'eventsubAlertsEnabled',
        'eventsubSubscriptionAlerts',
        'eventsubGiftSubAlerts',
        'eventsubCheerAlerts',
        'eventsubFollowAlerts',
        'eventsubRaidAlerts',
        'eventsubWebhookSecret'
      ];

      const updatedSettings = {};

      for (const [key, value] of Object.entries(settings)) {
        if (validSettings.includes(key)) {
          // Validate boolean settings
          if (key === 'twitchIntegrationEnabled' || key.startsWith('eventsub')) {
            const boolValue = value === true || value === 'true';
            await db.setSetting(key, boolValue.toString());
            updatedSettings[key] = boolValue.toString();
          }
          // Validate chat provider setting
          else if (key === 'chatProvider') {
            const validProviders = ['twitch', 'kick'];
            if (!value || !validProviders.includes(value)) {
              return res.status(400).json({
                error: `Invalid chat provider: ${value}`,
                message: 'Chat provider must be either "twitch" or "kick"'
              });
            }
            await db.setSetting(key, value.toString());
            updatedSettings[key] = value.toString();
          }
          // Validate numeric settings
          else if (key.includes('Amount') || key.includes('Ratio')) {
            const numValue = parseFloat(value);
            if (isNaN(numValue) || numValue < 0) {
              return res.status(400).json({
                error: `Invalid value for ${key}`,
                message: 'Amount values must be positive numbers'
              });
            }
            await db.setSetting(key, numValue.toString());
            updatedSettings[key] = numValue.toString();
          }
          // String settings
          else {
            const stringValue = value !== null && value !== undefined ? value.toString() : '';
            await db.setSetting(key, stringValue);
            updatedSettings[key] = stringValue;
          }
        }
      }

      console.log(`[Admin] Updated Twitch settings:`, Object.keys(updatedSettings));

      return res.status(200).json({
        success: true,
        message: 'Twitch settings updated successfully',
        updated: updatedSettings
      });

    } catch (error) {
      console.error('Error updating Twitch settings:', error);
      return res.status(500).json({
        error: 'Failed to update settings',
        message: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

module.exports = cors(requireAdmin(handler));