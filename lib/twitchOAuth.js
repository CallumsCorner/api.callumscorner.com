// twitchOAuth.js - Twitch OAuth and API integration
const crypto = require('crypto');
const db = require('./database');

class TwitchOAuth {
  constructor() {
    this.clientId = process.env.TWITCH_CLIENT_ID;
    this.clientSecret = process.env.TWITCH_CLIENT_SECRET;
    this.redirectUri = process.env.TWITCH_REDIRECT_URI || 'https://api.callumscorner.com/twitch/auth/callback';
    this.channelId = process.env.TWITCH_CHANNEL_ID; // Twitch channel ID
    this.baseUrl = 'https://api.twitch.tv/helix';
    this.authUrl = 'https://id.twitch.tv/oauth2';

    // Encryption key for storing tokens securely
    this.encryptionKey = process.env.TWITCH_ENCRYPTION_KEY;

    // Cache for VIP and subscription data (5 minutes)
    this.cache = {
      vips: { data: null, timestamp: 0 },
      subscriptions: { data: null, timestamp: 0 }
    };
    this.cacheExpiration = 5 * 60 * 1000; // 5 minutes in milliseconds
  }

  // Check if cache is valid (not expired)
  isCacheValid(cacheType) {
    const cache = this.cache[cacheType];
    return cache.data !== null && (Date.now() - cache.timestamp) < this.cacheExpiration;
  }

  // Get cached data if valid
  getCachedData(cacheType) {
    if (this.isCacheValid(cacheType)) {
      return this.cache[cacheType].data;
    }
    return null;
  }

  // Set cache data with current timestamp
  setCacheData(cacheType, data) {
    this.cache[cacheType] = {
      data: data,
      timestamp: Date.now()
    };
  }

  // Fetch VIP list using broadcaster credentials (cached)
  async getVipList() {
    // Check cache first
    const cachedVips = this.getCachedData('vips');
    if (cachedVips) {
      return cachedVips;
    }

    const clientId = process.env.TWITCH_BROADCASTER_CLIENT_ID;
    const accessToken = process.env.TWITCH_BROADCASTER_ACCESS_TOKEN;
    const channelId = process.env.TWITCH_CHANNEL_ID;

    if (!clientId || !accessToken || !channelId) {
      throw new Error('Twitch broadcaster configuration incomplete');
    }

    try {
      let allVips = [];
      let cursor = null;

      do {
        const url = new URL('https://api.twitch.tv/helix/channels/vips');
        url.searchParams.append('broadcaster_id', channelId);
        url.searchParams.append('first', '100');
        if (cursor) {
          url.searchParams.append('after', cursor);
        }

        const response = await fetch(url.toString(), {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Client-Id': clientId
          }
        });

        if (!response.ok) {
          throw new Error(`Twitch API error: ${response.status}`);
        }

        const data = await response.json();

        const pageVips = data.data.map(vip => ({
          userId: vip.user_id,
          userLogin: vip.user_login,
          userName: vip.user_name
        }));

        allVips = allVips.concat(pageVips);
        cursor = data.pagination?.cursor;

      } while (cursor);

      // Cache the result
      this.setCacheData('vips', allVips);
      return allVips;

    } catch (error) {
      console.error('Error fetching VIP list:', error);
      throw error;
    }
  }

  // Generate OAuth authorization URL
  generateAuthUrl(state = null) {
    if (!this.clientId) {
      throw new Error('Twitch Client ID not configured');
    }

    const stateParam = state || crypto.randomBytes(16).toString('hex');
    const scopes = [
      'user:read:subscriptions'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: scopes,
      state: stateParam
    });

    return {
      url: `${this.authUrl}/authorize?${params.toString()}`,
      state: stateParam
    };
  }

  // Exchange authorization code for access token
  async exchangeCodeForToken(code) {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Twitch credentials not configured');
    }

    const response = await fetch(`${this.authUrl}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Twitch OAuth error: ${response.status} - ${errorData}`);
    }

    const tokenData = await response.json();
    return tokenData;
  }

  // Refresh access token
  async refreshAccessToken(refreshToken) {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Twitch credentials not configured');
    }

    const response = await fetch(`${this.authUrl}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Twitch refresh token error: ${response.status} - ${errorData}`);
    }

    return await response.json();
  }

  // Get user info from Twitch API
  async getUserInfo(accessToken) {
    const response = await fetch(`${this.baseUrl}/users`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Client-Id': this.clientId
      }
    });

    if (!response.ok) {
      throw new Error(`Twitch API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0]; // Returns user object
  }

  // Check if user is subscribed to the channel
  async checkSubscription(accessToken, userId) {
    if (!this.channelId) {
      console.warn('Twitch channel ID not configured, skipping subscription check');
      return { isSubscribed: false, tier: 0 };
    }

    try {
      const response = await fetch(`${this.baseUrl}/subscriptions/user?broadcaster_id=${this.channelId}&user_id=${userId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Client-Id': this.clientId
        }
      });

      if (response.status === 404) {
        // User is not subscribed
        return { isSubscribed: false, tier: 0, isVip: false };
      }

      if (!response.ok) {
        throw new Error(`Subscription check error: ${response.status}`);
      }

      const data = await response.json();
      const subscription = data.data[0];

      return {
        isSubscribed: true,
        tier: this.getTierFromPlan(subscription.tier),
        planName: subscription.plan_name,
        giftedBy: subscription.is_gift ? subscription.gifter_login : null,
        isVip: subscription.is_vip || false
      };
    } catch (error) {
      console.error('Error checking subscription:', error);
      return { isSubscribed: false, tier: 0, isVip: false, error: error.message };
    }
  }

  // Check if user is a VIP - simplified to avoid 401 errors
  async checkVipStatus(accessToken, userId) {
    if (!this.channelId) {
      console.warn('Twitch channel ID not configured, skipping VIP check');
      return false;
    }

    // For now, return false to avoid 401 errors with user tokens
    // VIP checking requires broadcaster permissions which user tokens don't have, twitch is overcomplicated
    console.log('VIP checking disabled - requires broadcaster token, user tokens get 401');
    return false;
  }

  // Helper to convert Twitch tier to numeric value
  getTierFromPlan(tierString) {
    switch (tierString) {
      case '1000': return 1;
      case '2000': return 2;
      case '3000': return 3;
      default: return 0;
    }
  }

  // Encrypt token for storage
  encryptToken(token) {
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  // Decrypt token from storage
  decryptToken(encryptedToken) {
    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
    let decrypted = decipher.update(encryptedToken, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Store or update user authentication data
  async storeUserAuth(tokenData, userInfo, subscriptionInfo, isVip) {
    const encryptedAccessToken = this.encryptToken(tokenData.access_token);
    const encryptedRefreshToken = tokenData.refresh_token ? this.encryptToken(tokenData.refresh_token) : null;
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

    const authData = {
      twitch_user_id: userInfo.id,
      username: userInfo.login,
      display_name: userInfo.display_name,
      profile_image_url: userInfo.profile_image_url,
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      token_expires_at: expiresAt,
      subscriber_tier: subscriptionInfo.tier || 0,
      is_vip: isVip
    };

    try {
      // Use upsert logic - insert or update if exists
      await db.upsertTwitchAuth(authData);
      return authData;
    } catch (error) {
      console.error('Error storing Twitch auth data:', error);
      throw error;
    }
  }

  // Get stored user authentication data
  async getUserAuth(twitchUserId) {
    try {
      const authData = await db.getTwitchAuth(twitchUserId);
      if (!authData) {
        return null;
      }

      // Decrypt tokens
      authData.access_token = this.decryptToken(authData.access_token);
      if (authData.refresh_token) {
        authData.refresh_token = this.decryptToken(authData.refresh_token);
      }

      return authData;
    } catch (error) {
      console.error('Error getting Twitch auth data:', error);
      throw error;
    }
  }

  // Refresh user data and tokens if needed
  async refreshUserData(twitchUserId) {
    const authData = await this.getUserAuth(twitchUserId);
    if (!authData) {
      throw new Error('User not found');
    }

    // Check if token is expired or expires soon (within 1 hour)
    const tokenExpiresAt = new Date(authData.token_expires_at);
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);

    let accessToken = authData.access_token;

    if (tokenExpiresAt <= oneHourFromNow && authData.refresh_token) {
      try {
        console.log(`Refreshing token for user ${twitchUserId}`);
        const newTokenData = await this.refreshAccessToken(authData.refresh_token);

        // Update stored tokens
        const encryptedAccessToken = this.encryptToken(newTokenData.access_token);
        const encryptedRefreshToken = newTokenData.refresh_token ? this.encryptToken(newTokenData.refresh_token) : authData.refresh_token;
        const newExpiresAt = new Date(Date.now() + (newTokenData.expires_in * 1000));

        await db.updateTwitchAuthTokens(twitchUserId, encryptedAccessToken, encryptedRefreshToken, newExpiresAt);
        accessToken = newTokenData.access_token;
      } catch (error) {
        console.error('Error refreshing token:', error);
        throw new Error('Failed to refresh authentication');
      }
    }

    // Update subscription and VIP status on every refresh
    try {
      console.log(`Updating subscription data for user ${twitchUserId}`);
      const subscriptionInfo = await this.checkSubscription(accessToken, twitchUserId);
      const isVip = await this.checkVipStatus(accessToken, twitchUserId);

      // Note: Twitch API doesn't reliably provide subscription creation/renewal dates
      // Credits are managed through status-based allocation

      await db.updateTwitchAuthStatus(twitchUserId, subscriptionInfo.tier || 0, isVip);

      authData.subscriber_tier = subscriptionInfo.tier || 0;
      authData.is_vip = isVip;
    } catch (error) {
      console.error('Error updating subscription status:', error);
      // Don't throw - continue with cached data
    }

    return authData;
  }

  // Validate configuration
  isConfigured() {
    console.log('configuration check:');
    console.log('- Client ID:', this.clientId ? 'SET' : 'MISSING');
    console.log('- Client Secret:', this.clientSecret ? 'SET' : 'MISSING');
    console.log('- Redirect URI:', this.redirectUri || 'MISSING');

    const configured = !!(this.clientId && this.clientSecret && this.redirectUri);
    console.log('- Configuration valid:', configured);
    return configured;
  }
}

module.exports = new TwitchOAuth();