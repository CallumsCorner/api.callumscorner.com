const mariadb = require('mariadb');
const bcrypt = require('bcryptjs');
const aiFilter = require('./ai-filter');

let pool;

function createPool() {
  if (!pool) {
    let config;

    if (process.env.DATABASE_URL) {
      const url = new URL(process.env.DATABASE_URL);
      config = {
        host: url.hostname,
        port: url.port || 3306,
        user: url.username,
        password: url.password,
        database: url.pathname.substring(1),
      };
    } else {
      config = {
        host: 'db',
        port: 3306,
        user: process.env.DB_USER || 'donation_user',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'donation_system',
      };
    }

    console.log('Database config:', {
      host: config.host,
      port: config.port,
      user: config.user,
      database: config.database,
      hasPassword: !!config.password
    });

    pool = mariadb.createPool({
      ...config,
      connectionLimit: 10,
      acquireTimeout: 60000,
      timeout: 60000,
      reconnect: true,
      charset: 'utf8mb4',
    });
  }
  return pool;
}

async function getConnection() {
  const pool = createPool();
  return await pool.getConnection();
}

async function initializeAdminUser() {
  const conn = await getConnection();
  try {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    const anyUser = await conn.query('SELECT id FROM Users LIMIT 1');

    if (anyUser.length === 0) {
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      await conn.query(
        'INSERT INTO Users (username, password, role) VALUES (?, ?, ?)',
        [adminUsername, hashedPassword, 'admin']
      );
      console.log(`Default admin user created: ${adminUsername}`);
    }
  } catch (error) {
    console.error('Error initializing admin user:', error);
  } finally {
    conn.release();
  }
}

function convertBigIntToNumber(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (obj instanceof Date) {
    return obj;
  }
  
  if (typeof obj === 'bigint') {
    return Number(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(convertBigIntToNumber);
  }
  
  if (typeof obj === 'object') {
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertBigIntToNumber(value);
    }
    return converted;
  }
  
  return obj;
}

const db = {
  async query(sql, params = []) {
  const conn = await getConnection();
  try {
    const result = await conn.query(sql, params);
    return convertBigIntToNumber(result);
  } finally {
    conn.release();
  }
  },

  async transaction(callback) {
    const conn = await getConnection();
    try {
      await conn.beginTransaction();
      const result = await callback(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  },

  async createUser(username, password, role = 'user') {
    const hashedPassword = await bcrypt.hash(password, 12);
    return await this.query(
      'INSERT INTO Users (username, password, role) VALUES (?, ?, ?)',
      [username, hashedPassword, role]
    );
  },

  async getUserByUsername(username) {
    const result = await this.query('SELECT * FROM Users WHERE username = ?', [username]);
    return result[0] || null;
  },

  async getUserById(id) {
    const result = await this.query('SELECT * FROM Users WHERE id = ?', [id]);
    return result[0] || null;
  },

  async updateLastLogin(userId) {
    return await this.query('UPDATE Users SET last_login = NOW() WHERE id = ?', [userId]);
  },

  async deleteUser(id) {
    return await this.query('DELETE FROM Users WHERE id = ?', [id]);
  },

  async getAllUsers() {
    return await this.query('SELECT id, username, role, last_login, created_at FROM Users ORDER BY created_at DESC');
  },

  async resetUserPassword(id, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    return await this.query('UPDATE Users SET password = ? WHERE id = ?', [hashedPassword, id]);
  },

  async createSession(userId, token, expiresAt) {
    return await this.query(
      'INSERT INTO Sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
      [userId, token, expiresAt]
    );
  },

  async getSessionByToken(token) {
    const result = await this.query(
      'SELECT s.*, u.username, u.role FROM Sessions s JOIN Users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > NOW()',
      [token]
    );
    return result[0] || null;
  },

  async deleteSession(token) {
    return await this.query('DELETE FROM Sessions WHERE token = ?', [token]);
  },

  async deleteUserSessions(userId) {
    return await this.query('DELETE FROM Sessions WHERE user_id = ?', [userId]);
  },

  async getSetting(key) {
    const result = await this.query('SELECT setting_value FROM Settings WHERE setting_key = ?', [key]);
    return result[0]?.setting_value || null;
  },

  async setSetting(key, value) {
    return await this.query(
      'INSERT INTO Settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
      [key, value]
    );
  },



  async getDonationQueue() {
    return await this.query('SELECT * FROM DonationQueue ORDER BY created_at ASC, id ASC');
  },

  async getDonationHistory() {
    return await this.query('SELECT * FROM DonationHistory ORDER BY created_at DESC, id DESC');
  },

  async getNextDonationFromQueue() {
    const result = await this.query('SELECT * FROM DonationQueue ORDER BY created_at ASC, id ASC LIMIT 1');
    return result[0] || null;
  },

  async removeDonationFromQueue(id) {
    return await this.query('DELETE FROM DonationQueue WHERE id = ?', [id]);
  },

  async getDonationFromHistory(id) {
    const result = await this.query('SELECT * FROM DonationHistory WHERE id = ?', [id]);
    return result[0] || null;
  },


  async addMediaToHistory(orderID, donorName, mediaUrl, startTime = 0, videoTitle = '', videoThumbnail = '', videoDuration = 0, isReplay = false, donationId = null, payerId = null) {
    const cleanDonorName = String(donorName || 'Anonymous').trim();
    const cleanMediaUrl = String(mediaUrl).trim();
    const cleanVideoTitle = String(videoTitle || '').trim();
    const cleanVideoThumbnail = String(videoThumbnail || '').trim();
    
    return await this.query(
      'INSERT INTO MediaHistory (donation_id, order_id, donor_name, media_url, media_start_time, video_title, video_thumbnail, video_duration, is_replay, payer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [donationId, orderID, cleanDonorName, cleanMediaUrl, startTime, cleanVideoTitle, cleanVideoThumbnail, videoDuration, isReplay, payerId]
    );
  },

  async getMediaQueue() {
    return await this.query('SELECT * FROM MediaQueue ORDER BY created_at ASC, id ASC');
  },

  async getMediaHistory() {
    return await this.query('SELECT * FROM MediaHistory ORDER BY created_at DESC, id DESC');
  },

  async getNextMediaFromQueue() {
    const result = await this.query('SELECT * FROM MediaQueue ORDER BY created_at ASC, id ASC LIMIT 1');
    return result[0] || null;
  },

  async removeMediaFromQueue(id) {
    return await this.query('DELETE FROM MediaQueue WHERE id = ?', [id]);
  },

  async getMediaFromHistory(id) {
    const result = await this.query('SELECT * FROM MediaHistory WHERE id = ?', [id]);
    return result[0] || null;
  },

  async addSoundEffect(name, filename, originalName, fileSize, duration = null) {
    return await this.query(
      'INSERT INTO SoundEffects (name, filename, original_name, file_size, duration) VALUES (?, ?, ?, ?, ?)',
      [name, filename, originalName, fileSize, duration]
    );
  },

  async getAllSoundEffects() {
    return await this.query('SELECT * FROM SoundEffects ORDER BY created_at DESC');
  },

  async getSoundEffectById(id) {
    const result = await this.query('SELECT * FROM SoundEffects WHERE id = ?', [id]);
    return result[0] || null;
  },

  async getActiveSoundEffect() {
    const result = await this.query('SELECT * FROM SoundEffects WHERE is_active = TRUE LIMIT 1');
    return result[0] || null;
  },

  async setActiveSoundEffect(id) {
    // deactivate all sound effects - should only be one anyway
    await this.query('UPDATE SoundEffects SET is_active = FALSE');
    
    // Then activate the specified one (if id is not null)
    if (id && id !== 'null') {
      await this.query('UPDATE SoundEffects SET is_active = TRUE WHERE id = ?', [id]);
      await this.setSetting('activeSoundEffectId', id.toString());
    } else {
      await this.setSetting('activeSoundEffectId', 'null');
    }
  },

  async deleteSoundEffect(id) {
    return await this.query('DELETE FROM SoundEffects WHERE id = ?', [id]);
  },

  async updateSoundEffect(id, updates) {
    const setParts = [];
    const values = [];

    Object.keys(updates).forEach(key => {
      setParts.push(`${key} = ?`);
      values.push(updates[key]);
    });
    
    if (setParts.length === 0) return;
    
    values.push(id);
    return await this.query(
      `UPDATE SoundEffects SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = ?`,
      values
    );
  },

  async addSoundboardSound(name, filename, originalName, fileSize) {
    return await this.query(
      'INSERT INTO Soundboard (name, filename, original_name, file_size) VALUES (?, ?, ?, ?)',
      [name, filename, originalName, fileSize]
    );
  },

  async getAllSoundboardSounds() {
    return await this.query('SELECT * FROM Soundboard ORDER BY created_at DESC');
  },

  async getSoundboardSoundById(id) {
    const result = await this.query('SELECT * FROM Soundboard WHERE id = ?', [id]);
    return result[0] || null;
  },

  async deleteSoundboardSound(id) {
    return await this.query('DELETE FROM Soundboard WHERE id = ?', [id]);
  },

  async checkOrderExists(orderID) {
    const queueResult = await this.query('SELECT id FROM DonationQueue WHERE order_id = ?', [orderID]);
    const historyResult = await this.query('SELECT id FROM DonationHistory WHERE order_id = ?', [orderID]);
    const mediaQueueResult = await this.query('SELECT id FROM MediaQueue WHERE order_id = ?', [orderID]);
    const mediaHistoryResult = await this.query('SELECT id FROM MediaHistory WHERE order_id = ?', [orderID]);
    return queueResult.length > 0 || historyResult.length > 0 || mediaQueueResult.length > 0 || mediaHistoryResult.length > 0;
  },

  async banVideo(videoId, videoUrl, videoTitle, reason, notes, bannedByUserId) {
    return await this.query(
      'INSERT INTO BannedVideos (video_id, video_url, video_title, reason, notes, banned_by_user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [videoId, videoUrl, videoTitle || '', reason || '', notes || '', bannedByUserId]
    );
  },

  async getAllBannedVideos() {
    return await this.query(`
      SELECT bv.*, u.username as banned_by_username 
      FROM BannedVideos bv 
      JOIN Users u ON bv.banned_by_user_id = u.id 
      ORDER BY bv.banned_at DESC
    `);
  },

  async isVideoBanned(videoId) {
    const result = await this.query('SELECT id FROM BannedVideos WHERE video_id = ?', [videoId]);
    return result.length > 0;
  },

  async updateVideoBan(id, updates) {
    const setParts = [];
    const values = [];
    
    Object.keys(updates).forEach(key => {
      setParts.push(`${key} = ?`);
      values.push(updates[key]);
    });
    
    if (setParts.length === 0) return;
    
    values.push(id);
    return await this.query(
      `UPDATE BannedVideos SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = ?`,
      values
    );
  },

  async deleteVideoBan(id) {
    return await this.query('DELETE FROM BannedVideos WHERE id = ?', [id]);
  },

  async getMediaHistoryWithBans() {
    return await this.query(`
      SELECT 
        mh.*,
        CASE WHEN bu.id IS NOT NULL THEN 1 ELSE 0 END as is_user_banned,
        CASE WHEN bv.id IS NOT NULL THEN 1 ELSE 0 END as is_video_banned
      FROM MediaHistory mh 
      LEFT JOIN BannedUsers bu ON mh.payer_id = bu.payer_id 
      LEFT JOIN BannedVideos bv ON SUBSTRING_INDEX(SUBSTRING_INDEX(mh.media_url, 'v=', -1), '&', 1) = bv.video_id
                                  OR SUBSTRING_INDEX(mh.media_url, '/', -1) = bv.video_id
      WHERE mh.is_replay = 0
      ORDER BY mh.created_at DESC 
      LIMIT 100
    `);
  },

  async cleanupOldData() {
    const conn = await getConnection();
    try {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      console.log(`Archiving and cleaning up data older than ${threeDaysAgo.toISOString()}`);

      // ARCHIVED DONOS ARE FOR REWIND STATS.

      // Archive donations before deleting (exclude replays and already-archived records)
      const donationArchiveResult = await conn.query(
        `INSERT INTO DonationArchive (original_id, order_id, name, amount, message, originalMessage, payer_id, is_replay, created_at)
         SELECT id, order_id, name, amount, message, originalMessage, payer_id, is_replay, created_at
         FROM DonationHistory
         WHERE created_at < ? AND is_replay = FALSE
           AND id NOT IN (SELECT original_id FROM DonationArchive)`,
        [threeDaysAgo]
      );

      // Archive media before deleting (exclude replays and already-archived records)
      const mediaArchiveResult = await conn.query(
        `INSERT INTO MediaArchive (original_id, donation_id, order_id, donor_name, media_url, media_start_time, video_title, video_thumbnail, video_duration, is_replay, payer_id, created_at)
         SELECT id, donation_id, order_id, donor_name, media_url, media_start_time, video_title, video_thumbnail, video_duration, is_replay, payer_id, created_at
         FROM MediaHistory
         WHERE created_at < ? AND is_replay = FALSE
           AND id NOT IN (SELECT original_id FROM MediaArchive)`,
        [threeDaysAgo]
      );

      // Archive leaderboard entries before deleting (exclude already-archived records)
      const leaderboardArchiveResult = await conn.query(
        `INSERT INTO LeaderboardArchive (original_id, name, amount, created_at)
         SELECT id, name, amount, created_at
         FROM Leaderboard
         WHERE created_at < ?
           AND id NOT IN (SELECT original_id FROM LeaderboardArchive)`,
        [thirtyDaysAgo]
      );

      // Now delete from live tables (including replays)
      const TTSResult = await conn.query(
        'DELETE FROM DonationHistory WHERE created_at < ?',
        [threeDaysAgo]
      );
      const MediaResult = await conn.query(
        'DELETE FROM MediaHistory WHERE created_at < ?',
        [threeDaysAgo]
      );
      const LeaderboardResult = await conn.query(
        'DELETE FROM Leaderboard WHERE created_at < ?',
        [thirtyDaysAgo]
      );

      console.log(`Cleanup complete. Archived ${donationArchiveResult.affectedRows} donations, ${mediaArchiveResult.affectedRows} media, ${leaderboardArchiveResult.affectedRows} leaderboard entries. Deleted ${TTSResult.affectedRows} TTS history records, ${MediaResult.affectedRows} Media History records, and ${LeaderboardResult.affectedRows} Leaderboard records.`);
    } catch (error) {
      console.error('Error cleaning up old data:', error);
    } finally {
      conn.release();
    }
  },

  async addDonationToLeaderboard(name, amount) {
    const cleanName = String(name || 'Anonymous').trim();
    const cleanAmount = parseFloat(amount);
    
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
      return; // Do not add invalid donations to the leaderboard
    }
    
    return await this.query(
      'INSERT INTO Leaderboard (name, amount) VALUES (?, ?)',
      [cleanName, cleanAmount]
    );
  },

  async getLeaderboard(interval) {
    return await this.query(
      `SELECT name, SUM(amount) as total_amount 
       FROM Leaderboard 
       WHERE created_at >= NOW() - INTERVAL ${interval}
       GROUP BY name 
       ORDER BY total_amount DESC 
       LIMIT 10`
    );
  },

  async createRefundRequest(orderId, reason, additionalInfo) {
    return await this.query(
      'INSERT INTO RefundRequests (order_id, reason, additional_info) VALUES (?, ?, ?)',
      [orderId, reason, additionalInfo]
    );
  },

  async getAllRefundRequests() {
    return await this.query(`
      SELECT rr.*, u.username as processed_by_username 
      FROM RefundRequests rr 
      LEFT JOIN Users u ON rr.processed_by_user_id = u.id 
      ORDER BY rr.created_at DESC
    `);
  },

  async getRefundRequestById(id) {
    const result = await this.query('SELECT * FROM RefundRequests WHERE id = ?', [id]);
    return result[0] || null;
  },

  async updateRefundRequest(id, updates) {
    const setParts = [];
    const values = [];
    
    Object.keys(updates).forEach(key => {
      setParts.push(`${key} = ?`);
      values.push(updates[key]);
    });
    
    if (setParts.length === 0) return;
    
    values.push(id);
    return await this.query(
      `UPDATE RefundRequests SET ${setParts.join(', ')} WHERE id = ?`,
      values
    );
  },

  async deleteRefundRequest(id) {
    return await this.query('DELETE FROM RefundRequests WHERE id = ?', [id]);
  },

};

if (typeof window === 'undefined') {
  setTimeout(initializeAdminUser, 5000); // Wait for database to be ready
}

db.applyFilterBatch = async function(texts) {
  const filterEnabled = await this.getSetting('filterEnabled');

  // If filter disabled or no texts, return originals
  if (filterEnabled !== 'true' || !texts || texts.length === 0) {
    return texts.map(text => ({ original: text, filtered: text, wasFiltered: false }));
  }

  // Get banned words from database
  const bannedWordsResult = await this.query('SELECT word FROM WordFilter');
  if (bannedWordsResult.length === 0) {
    return texts.map(text => ({ original: text, filtered: text, wasFiltered: false }));
  }

  const bannedWords = bannedWordsResult.map(item => item.word);

  // Get AI filter settings
  const aiEnabled = await this.getSetting('aiFilterEnabled');
  const cacheEnabled = await this.getSetting('aiFilterCache');

  // Use batch filtering (single AI request for all texts)
  try {
    const results = await aiFilter.filterMessagesBatch(
      texts,
      bannedWords,
      cacheEnabled === 'true',
      aiEnabled === 'true'
    );

    // Convert to expected format
    return texts.map((text, i) => ({
      original: text,
      filtered: results[i].filtered,
      wasFiltered: results[i].wasFiltered,
      matchedWords: results[i].matchedWords || []
    }));
  } catch (error) {
    console.error('[Filter Batch] Error in AI filter:', error.message);
    // Return originals on error
    return texts.map(text => ({ original: text, filtered: text, wasFiltered: false }));
  }
};

db.applyFilter = async function(message) {
  const filterEnabled = await this.getSetting('filterEnabled');
  if (filterEnabled !== 'true' || !message) {
    return { original: message, filtered: message, wasFiltered: false };
  }

  // Get banned words from database
  const bannedWordsResult = await this.query('SELECT word FROM WordFilter');
  if (bannedWordsResult.length === 0) {
    return { original: message, filtered: message, wasFiltered: false };
  }

  const bannedWords = bannedWordsResult.map(item => item.word);

  // Get AI filter settings
  const aiEnabled = await this.getSetting('aiFilterEnabled');
  const cacheEnabled = await this.getSetting('aiFilterCache');

  // Use AI filter service
  try {
    const result = await aiFilter.filterMessage(
      message,
      bannedWords,
      cacheEnabled === 'true',
      aiEnabled === 'true'
    );

    // Log if filtering occurred
    if (result.wasFiltered) {
      console.log(`[Filter] Filtered message. Method: ${result.usedAI ? 'AI' : 'Regex'}, Confidence: ${result.confidence}%`);
    }

    return {
      original: message,
      filtered: result.filtered,
      wasFiltered: result.wasFiltered,
      matchedWords: result.matchedWords || []
    };
  } catch (error) {
    console.error('[Filter] Error in AI filter, returning original message:', error.message);
    // If AI filter fails completely, return original message (safer than blocking legitimate content)
    return { original: message, filtered: message, wasFiltered: false };
  }
};

db.upsertTwitchAuth = async function(authData) {
  return await this.query(`
    INSERT INTO TwitchAuth (
      twitch_user_id, username, display_name, profile_image_url,
      access_token, refresh_token, token_expires_at, subscriber_tier, is_vip
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      username = VALUES(username),
      display_name = VALUES(display_name),
      profile_image_url = VALUES(profile_image_url),
      access_token = VALUES(access_token),
      refresh_token = VALUES(refresh_token),
      token_expires_at = VALUES(token_expires_at),
      subscriber_tier = VALUES(subscriber_tier),
      is_vip = VALUES(is_vip),
      updated_at = CURRENT_TIMESTAMP
  `, [
    authData.twitch_user_id,
    authData.username,
    authData.display_name,
    authData.profile_image_url,
    authData.access_token,
    authData.refresh_token,
    authData.token_expires_at,
    authData.subscriber_tier,
    authData.is_vip
  ]);
};

db.getTwitchAuth = async function(twitchUserId) {
  const result = await this.query('SELECT * FROM TwitchAuth WHERE twitch_user_id = ?', [twitchUserId]);
  return result[0] || null;
};

db.updateTwitchAuthTokens = async function(twitchUserId, accessToken, refreshToken, expiresAt) {
  return await this.query(`
    UPDATE TwitchAuth
    SET access_token = ?, refresh_token = ?, token_expires_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE twitch_user_id = ?
  `, [accessToken, refreshToken, expiresAt, twitchUserId]);
};

db.updateTwitchAuthStatus = async function(twitchUserId, subscriberTier, isVip) {
  // Update the auth status
  const result = await this.query(`
    UPDATE TwitchAuth
    SET subscriber_tier = ?, is_vip = ?, updated_at = CURRENT_TIMESTAMP
    WHERE twitch_user_id = ?
  `, [subscriberTier, isVip, twitchUserId]);

  // Get the updated auth record to refresh credits
  const authData = await this.query('SELECT id FROM TwitchAuth WHERE twitch_user_id = ?', [twitchUserId]);
  if (authData.length > 0) {
    const twitchAuthId = authData[0].id;

    // Calculate current period
    const now = new Date();
    const currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Calculate eligible credits
    const tier1Amount = parseFloat(await this.getSetting('freeDonationTier1Amount')) || 3.00;
    const tier2Amount = parseFloat(await this.getSetting('freeDonationTier2Amount')) || 5.00;
    const tier3Amount = parseFloat(await this.getSetting('freeDonationTier3Amount')) || 10.00;
    const vipAmount = parseFloat(await this.getSetting('freeDonationVipAmount')) || 5.00;

    let subscriptionCredit = 0;
    switch (subscriberTier) {
      case 1: subscriptionCredit = tier1Amount; break;
      case 2: subscriptionCredit = tier2Amount; break;
      case 3: subscriptionCredit = tier3Amount; break;
    }

    // Get current usage for this period to preserve it
    const currentCredits = await this.query(`
      SELECT credit_type, amount_used FROM FreeDonationCredits
      WHERE twitch_auth_id = ? AND period_start = ? AND period_end = ?
    `, [twitchAuthId, currentPeriodStart, currentPeriodEnd]);

    const currentUsage = {};
    currentCredits.forEach(credit => {
      currentUsage[credit.credit_type] = credit.amount_used;
    });

    // Add subscription credits if eligible (accumulative system)
    if (subscriptionCredit > 0) {
      // Check if we already awarded credits for this month
      const existingCredit = await this.query(`
        SELECT id FROM FreeDonationCredits
        WHERE twitch_auth_id = ? AND credit_type = 'monthly_sub' AND period_start = ? AND period_end = ?
      `, [twitchAuthId, currentPeriodStart, currentPeriodEnd]);

      if (existingCredit.length === 0) {
        // Award new credits for this month
        await this.upsertFreeDonationCredit({
          twitch_auth_id: twitchAuthId,
          credit_type: 'monthly_sub',
          amount_available: subscriptionCredit,
          amount_used: 0,
          period_start: currentPeriodStart,
          period_end: currentPeriodEnd,
          last_reset: new Date()
        });
        console.log(`[twitch credit] Added tier ${subscriberTier} subscription credits (£${subscriptionCredit}) for user ${twitchUserId} for period ${currentPeriodStart.toISOString().split('T')[0]}`);
      } else {
        console.log(`[twitch credit] Credits already awarded for tier ${subscriberTier} subscription for user ${twitchUserId} for current period`);
      }
    }

    // Add VIP credits if eligible (accumulative system)
    if (isVip) {
      // Check if we already awarded VIP credits for this month
      const existingVipCredit = await this.query(`
        SELECT id FROM FreeDonationCredits
        WHERE twitch_auth_id = ? AND credit_type = 'vip' AND period_start = ? AND period_end = ?
      `, [twitchAuthId, currentPeriodStart, currentPeriodEnd]);

      if (existingVipCredit.length === 0) {
        // Award new VIP credits for this month
        await this.upsertFreeDonationCredit({
          twitch_auth_id: twitchAuthId,
          credit_type: 'vip',
          amount_available: vipAmount,
          amount_used: 0,
          period_start: currentPeriodStart,
          period_end: currentPeriodEnd,
          last_reset: new Date()
        });
        console.log(`[twitch credit] Added VIP credits (£${vipAmount}) for user ${twitchUserId} for period ${currentPeriodStart.toISOString().split('T')[0]}`);
      } else {
        console.log(`[twitch credit] VIP credits already awarded for user ${twitchUserId} for current period`);
      }
    }
  }

  return result;
};

db.updateSubscriptionRenewalDate = async function(twitchUserId, renewalDate) {
  return await this.query(`
    UPDATE TwitchAuth
    SET last_subscription_renewal = ?, updated_at = CURRENT_TIMESTAMP
    WHERE twitch_user_id = ?
  `, [renewalDate, twitchUserId]);
};

db.checkCreditAwardEligibility = async function(twitchUserId) {
  const authData = await this.query('SELECT last_credit_award_date FROM TwitchAuth WHERE twitch_user_id = ?', [twitchUserId]);

  if (authData.length === 0) {
    return false; // User doesn't exist
  }

  const lastAwardDate = authData[0].last_credit_award_date;

  if (!lastAwardDate) {
    return true; // Never received credits, eligible for first award
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

  return new Date(lastAwardDate) <= thirtyDaysAgo;
};

db.getNextCreditDate = async function(twitchUserId) {
  const authData = await this.query('SELECT last_credit_award_date FROM TwitchAuth WHERE twitch_user_id = ?', [twitchUserId]);

  if (authData.length === 0) {
    return null;
  }

  const lastAwardDate = authData[0].last_credit_award_date;

  if (!lastAwardDate) {
    return null; // Never received credits, will get them on next page load
  }

  // Next credit date is 30 days after last award
  const nextDate = new Date(lastAwardDate);
  nextDate.setDate(nextDate.getDate() + 30);

  return nextDate;
};

db.awardCredits = async function(twitchUserId, subscriberTier, isVip) {
  const authData = await this.query('SELECT id FROM TwitchAuth WHERE twitch_user_id = ?', [twitchUserId]);
  if (authData.length === 0) return;

  const twitchAuthId = authData[0].id;
  const now = new Date();

  // Calculate current month period for credit storage
  const currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Calculate credit amounts
  const tier1Amount = parseFloat(await this.getSetting('freeDonationTier1Amount')) || 3.00;
  const tier2Amount = parseFloat(await this.getSetting('freeDonationTier2Amount')) || 5.00;
  const tier3Amount = parseFloat(await this.getSetting('freeDonationTier3Amount')) || 10.00;
  const vipAmount = parseFloat(await this.getSetting('freeDonationVipAmount')) || 5.00;

  let subscriptionCredit = 0;
  switch (subscriberTier) {
    case 1: subscriptionCredit = tier1Amount; break;
    case 2: subscriptionCredit = tier2Amount; break;
    case 3: subscriptionCredit = tier3Amount; break;
  }

  // Award subscription credits (accumulative - only if not already awarded for this period)
  if (subscriptionCredit > 0) {
    const existingSubCredit = await this.query(`
      SELECT id FROM FreeDonationCredits
      WHERE twitch_auth_id = ? AND credit_type = 'monthly_sub' AND period_start = ? AND period_end = ?
    `, [twitchAuthId, currentPeriodStart, currentPeriodEnd]);

    if (existingSubCredit.length === 0) {
      await this.upsertFreeDonationCredit({
        twitch_auth_id: twitchAuthId,
        credit_type: 'monthly_sub',
        amount_available: subscriptionCredit,
        amount_used: 0,
        period_start: currentPeriodStart,
        period_end: currentPeriodEnd,
        last_reset: now
      });
      console.log(`[twitch credit] Awarded tier ${subscriberTier} subscription credits (£${subscriptionCredit}) to user ${twitchUserId} for period ${currentPeriodStart.toISOString().split('T')[0]}`);
    }
  }

  // Award VIP credits (accumulative - only if not already awarded for this period)
  if (isVip) {
    const existingVipCredit = await this.query(`
      SELECT id FROM FreeDonationCredits
      WHERE twitch_auth_id = ? AND credit_type = 'vip' AND period_start = ? AND period_end = ?
    `, [twitchAuthId, currentPeriodStart, currentPeriodEnd]);

    if (existingVipCredit.length === 0) {
      await this.upsertFreeDonationCredit({
        twitch_auth_id: twitchAuthId,
        credit_type: 'vip',
        amount_available: vipAmount,
        amount_used: 0,
        period_start: currentPeriodStart,
        period_end: currentPeriodEnd,
        last_reset: now
      });
      console.log(`[twitch credit] Awarded VIP credits (£${vipAmount}) to user ${twitchUserId} for period ${currentPeriodStart.toISOString().split('T')[0]}`);
    }
  }

  // Update last award date
  await this.query(`
    UPDATE TwitchAuth
    SET last_credit_award_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE twitch_user_id = ?
  `, [now, twitchUserId]);

  console.log(`[twitch credit] Updated last award date for user ${twitchUserId} to ${now.toISOString()}`);
};

db.deleteTwitchAuth = async function(twitchUserId) {
  return await this.query('DELETE FROM TwitchAuth WHERE twitch_user_id = ?', [twitchUserId]);
};

db.getFreeDonationCredits = async function(twitchAuthId, currentPeriodStart, currentPeriodEnd) {
  return await this.query(`
    SELECT * FROM FreeDonationCredits
    WHERE twitch_auth_id = ? AND period_start = ? AND period_end = ?
  `, [twitchAuthId, currentPeriodStart, currentPeriodEnd]);
};

db.upsertFreeDonationCredit = async function(creditData) {
  return await this.query(`
    INSERT INTO FreeDonationCredits (
      twitch_auth_id, credit_type, amount_available, amount_used,
      period_start, period_end, last_reset
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      amount_available = VALUES(amount_available),
      amount_used = VALUES(amount_used),
      last_reset = VALUES(last_reset),
      updated_at = CURRENT_TIMESTAMP
  `, [
    creditData.twitch_auth_id,
    creditData.credit_type,
    creditData.amount_available,
    creditData.amount_used,
    creditData.period_start,
    creditData.period_end,
    creditData.last_reset
  ]);
};

db.useFreeDonationCredit = async function(twitchAuthId, creditType, amount, periodStart, periodEnd) {
  return await this.query(`
    UPDATE FreeDonationCredits
    SET amount_used = amount_used + ?, updated_at = CURRENT_TIMESTAMP
    WHERE twitch_auth_id = ? AND credit_type = ? AND period_start = ? AND period_end = ?
  `, [amount, twitchAuthId, creditType, periodStart, periodEnd]);
};

db.useFreeDonationCreditAccumulative = async function(twitchAuthId, creditType, totalAmount) {
  // Get all available credits for this type, ordered by oldest first (FIFO)
  const availableCredits = await this.query(`
    SELECT id, amount_available, amount_used, (amount_available - amount_used) as remaining,
           period_start, period_end
    FROM FreeDonationCredits
    WHERE twitch_auth_id = ? AND credit_type = ? AND amount_available > amount_used
    ORDER BY period_start ASC
  `, [twitchAuthId, creditType]);

  let remainingToUse = totalAmount;
  const updatedRecords = [];

  for (const credit of availableCredits) {
    if (remainingToUse <= 0) break;

    const availableInThisRecord = credit.remaining;
    const useFromThisRecord = Math.min(availableInThisRecord, remainingToUse);

    if (useFromThisRecord > 0) {
      await this.query(`
        UPDATE FreeDonationCredits
        SET amount_used = amount_used + ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [useFromThisRecord, credit.id]);

      updatedRecords.push({
        period: `${credit.period_start} to ${credit.period_end}`,
        used: useFromThisRecord
      });

      remainingToUse -= useFromThisRecord;
    }
  }

  if (remainingToUse > 0) {
    throw new Error(`Insufficient ${creditType} credits. Could not use ${remainingToUse} remaining.`);
  }

  return updatedRecords;
};

db.getTotalAvailableCredits = async function(twitchAuthId) {
  // Get all available credits across ALL periods (accumulative system)
  const result = await this.query(`
    SELECT
      SUM(amount_available - amount_used) as total_available,
      GROUP_CONCAT(CONCAT(credit_type, ':', (amount_available - amount_used)) SEPARATOR ',') as breakdown
    FROM FreeDonationCredits
    WHERE twitch_auth_id = ? AND amount_available > amount_used
  `, [twitchAuthId]);

  const data = result[0];
  return {
    total: parseFloat(data.total_available) || 0,
    breakdown: data.breakdown ? data.breakdown.split(',').reduce((acc, item) => {
      const [type, amount] = item.split(':');
      acc[type] = (acc[type] || 0) + parseFloat(amount);
      return acc;
    }, {}) : {}
  };
};

db.addDonationToQueue = async function(donationData) {
  return await this.query(`
    INSERT INTO DonationQueue (order_id, name, amount, message, originalMessage, originalName, payer_id, is_replay)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    donationData.order_id,
    donationData.name,
    donationData.amount,
    donationData.message,
    donationData.originalMessage || donationData.message,
    donationData.originalName || donationData.name,
    donationData.payer_id,
    donationData.is_replay || false
  ]);
};

db.addDonationToHistory = async function(donationData) {
  return await this.query(`
    INSERT INTO DonationHistory (order_id, name, amount, message, originalMessage, originalName, payer_id, is_replay)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    donationData.order_id,
    donationData.name,
    donationData.amount,
    donationData.message,
    donationData.originalMessage || donationData.message,
    donationData.originalName || donationData.name,
    donationData.payer_id,
    donationData.is_replay || false
  ]);
};

db.addMediaToQueue = async function(mediaData) {
  return await this.query(`
    INSERT INTO MediaQueue (
      order_id, donor_name, media_url, media_start_time,
      video_title, payer_id, is_replay
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    mediaData.order_id,
    mediaData.donor_name,
    mediaData.media_url,
    mediaData.media_start_time,
    mediaData.video_title,
    mediaData.payer_id,
    mediaData.is_replay || false
  ]);
};

db.storeOAuthState = async function(state, expiresAt = null) {
  if (!expiresAt) {
    expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
  }
  return await this.query(`
    INSERT INTO OAuthStates (state, expires_at) VALUES (?, ?)
    ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at)
  `, [state, expiresAt]);
};

db.validateOAuthState = async function(state) {
  const result = await this.query(`
    SELECT state FROM OAuthStates
    WHERE state = ? AND expires_at > NOW()
  `, [state]);
  return result.length > 0;
};

db.deleteOAuthState = async function(state) {
  return await this.query(`
    DELETE FROM OAuthStates WHERE state = ?
  `, [state]);
};

db.cleanupExpiredOAuthStates = async function() {
  return await this.query(`
    DELETE FROM OAuthStates WHERE expires_at <= NOW()
  `);
};

db.createTwitchSession = async function(sessionData) {
  return await this.query(`
    INSERT INTO TwitchSessions (session_token, twitch_user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `, [
    sessionData.session_token,
    sessionData.twitch_user_id,
    sessionData.expires_at,
    sessionData.created_at
  ]);
};

db.getTwitchSessionUser = async function(sessionToken) {
  const result = await this.query(`
    SELECT ta.*
    FROM TwitchSessions ts
    JOIN TwitchAuth ta ON ts.twitch_user_id = ta.twitch_user_id
    WHERE ts.session_token = ? AND ts.expires_at > NOW()
  `, [sessionToken]);
  return result.length > 0 ? result[0] : null;
};

db.deleteTwitchSession = async function(sessionToken) {
  return await this.query(`
    DELETE FROM TwitchSessions WHERE session_token = ?
  `, [sessionToken]);
};

db.cleanupExpiredTwitchSessions = async function() {
  return await this.query(`
    DELETE FROM TwitchSessions WHERE expires_at <= NOW()
  `);
};

db.isUserBanned = async function(payerId) {
  const result = await this.query(`
    SELECT id FROM BannedUsers WHERE payer_id = ?
  `, [payerId]);
  return result.length > 0;
};

db.createApiKey = async function(name, permissions) {
  const crypto = require('crypto');
  const apiKey = crypto.randomBytes(32).toString('hex');
  const permissionsJson = JSON.stringify(permissions);

  await this.query(`
    INSERT INTO ApiKeys (api_key, name, permissions)
    VALUES (?, ?, ?)
  `, [apiKey, name, permissionsJson]);

  return apiKey;
};

db.getApiKeyByKey = async function(apiKey) {
  const result = await this.query(`
    SELECT * FROM ApiKeys WHERE api_key = ? AND is_active = TRUE
  `, [apiKey]);
  return result[0] || null;
};

db.getAllApiKeys = async function() {
  return await this.query(`
    SELECT id, name, permissions, is_active, last_used_at, created_at, updated_at
    FROM ApiKeys
    ORDER BY created_at DESC
  `);
};

db.updateApiKeyLastUsed = async function(id) {
  return await this.query(`
    UPDATE ApiKeys SET last_used_at = NOW() WHERE id = ?
  `, [id]);
};

db.deactivateApiKey = async function(id) {
  return await this.query(`
    UPDATE ApiKeys SET is_active = FALSE WHERE id = ?
  `, [id]);
};

db.deleteApiKey = async function(id) {
  return await this.query(`
    DELETE FROM ApiKeys WHERE id = ?
  `, [id]);
};

module.exports = db;