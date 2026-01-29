const crypto = require('crypto');
const db = require('../../../lib/database');

// Twitch EventSub webhook endpoint
module.exports = async (req, res) => {
  try {
    // Verify Twitch signature
    const signature = req.headers['twitch-eventsub-message-signature'];
    const timestamp = req.headers['twitch-eventsub-message-timestamp'];
    const messageId = req.headers['twitch-eventsub-message-id'];
    const messageType = req.headers['twitch-eventsub-message-type'];

    if (!signature || !timestamp || !messageId) {
      console.log('Missing required headers');
      return res.status(400).json({ error: 'Missing required headers' });
    }

    // Get webhook secret from environment
    const webhookSecret = process.env.TWITCH_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.log('Webhook secret not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    // Verify signature
    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(messageId + timestamp + body)
      .digest('hex');

    const providedSignature = signature.replace('sha256=', '');

    if (expectedSignature !== providedSignature) {
      console.log('Invalid signature');
      return res.status(403).json({ error: 'Invalid signature' });
    }

    // Handle different message types
    switch (messageType) {
      case 'webhook_callback_verification':
        console.log('Webhook verification requested');
        return res.status(200).send(req.body.challenge);

      case 'notification':
        console.log('Event notification received:', req.body.subscription.type);
        await handleEventNotification(req.body);
        return res.status(204).send();

      case 'revocation':
        console.log('Subscription revoked:', req.body.subscription.type);
        return res.status(204).send();

      default:
        console.log('Unknown message type:', messageType);
        return res.status(400).json({ error: 'Unknown message type' });
    }

  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
};

async function handleEventNotification(data) {
  const { subscription, event } = data;
  const eventType = subscription.type;

  console.log(`Processing ${eventType} event:`, event);

  try {
    // Create alert data for overlay
    const alertData = createAlertData(eventType, event);

    // Broadcast to overlay
    if (global.broadcastToClients && alertData) {
      global.broadcastToClients({
        type: 'twitch-alert',
        alertType: alertData.type,
        data: alertData,
        timestamp: new Date().toISOString()
      });

      console.log(`Broadcasted ${alertData.type} alert to overlay`);
    }

  } catch (error) {
    console.error('Error handling event notification:', error);
  }
}

function mapEventType(eventsubType) {
  switch (eventsubType) {
    case 'channel.subscribe':
      return 'subscription';
    case 'channel.subscription.gift':
      return 'gift_subscription';
    case 'channel.cheer':
      return 'cheer';
    case 'channel.follow':
      return 'follow';
    case 'channel.raid':
      return 'raid';
    default:
      return eventsubType;
  }
}

function createAlertData(eventType, event) {
  switch (eventType) {
    case 'channel.subscribe':
      return {
        type: 'subscription',
        user_name: event.user_name,
        user_display_name: event.user_display_name,
        tier: event.tier,
        is_gift: event.is_gift || false,
        cumulative_months: event.cumulative_months,
        streak_months: event.streak_months,
        message: event.message?.text || null
      };

    case 'channel.subscription.gift':
      return {
        type: 'gift_subscription',
        user_name: event.user_name,
        user_display_name: event.user_display_name,
        tier: event.tier,
        total: event.total,
        cumulative_total: event.cumulative_total,
        is_anonymous: event.is_anonymous || false
      };

    case 'channel.cheer':
      return {
        type: 'cheer',
        user_name: event.user_name,
        user_display_name: event.user_display_name,
        bits: event.bits,
        message: event.message || null,
        is_anonymous: event.is_anonymous || false
      };

    case 'channel.follow':
      return {
        type: 'follow',
        user_name: event.user_name,
        user_display_name: event.user_display_name,
        followed_at: event.followed_at
      };

    case 'channel.raid':
      return {
        type: 'raid',
        from_broadcaster_user_name: event.from_broadcaster_user_name,
        from_broadcaster_user_display_name: event.from_broadcaster_user_display_name,
        viewers: event.viewers
      };

    default:
      console.log(`Unknown event type for alert: ${eventType}`);
      return null;
  }
}