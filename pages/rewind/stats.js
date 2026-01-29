const db = require('../../lib/database');
const cors = require('../../lib/cors');

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not',
  'only', 'same', 'so', 'than', 'too', 'very', 'just', 'can', 'as', 'if', 'then',
  'because', 'while', 'although', 'though', 'after', 'before', 'since', 'until',
  'unless', 'about', 'into', 'through', 'during', 'above', 'below', 'between',
  'under', 'again', 'further', 'once', 'here', 'there', 'any', 'up', 'down', 'out',
  'off', 'over', 'own', 'now', 'get', 'got', 'go', 'going', 'gone', 'come', 'came',
  'let', 'lets', 'like', 'love', 'hi', 'hello', 'hey', 'please', 'thanks', 'thank',
  'callum', 'king', 'donation', 'donate', 'stream', 'streams', 'streaming',
  'lol', 'lmao', 'haha', 'hahaha', 'xd', 'im', 'ive', 'dont', 'cant', 'wont', 'youre',
  'its', 'thats', 'whats', 'hes', 'shes', 'were', 'theyre', 'ill', 'youll', 'well',
  'one', 'two', 'three', 'also', 'really', 'want', 'know', 'think', 'see', 'make',
  'good', 'great', 'best', 'much', 'many', 'even', 'still', 'back', 'way', 'new',
]);

function extractWords(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

function extractVideoId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function getYouTubeChannelName(videoId) {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (response.ok) {
      const data = await response.json();
      return data.author_name || null;
    }
  } catch (error) {
    console.warn(`Failed to fetch YouTube channel for ${videoId}:`, error.message);
  }
  return null;
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const startDate = `${year}-01-01 00:00:00`;
    const endDate = `${year}-12-31 23:59:59`;

    // Get donation stats from archive only
    const [archiveStats] = await db.query(`
      SELECT
        COUNT(*) as total_donations,
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(DISTINCT LOWER(name)) as unique_donors,
        COALESCE(AVG(amount), 0) as avg_donation
      FROM DonationArchive
      WHERE created_at BETWEEN ? AND ? AND is_replay = FALSE
    `, [startDate, endDate]);

    // Get media stats from archive only
    const [mediaStats] = await db.query(`
      SELECT COUNT(*) as total_videos
      FROM MediaArchive
      WHERE created_at BETWEEN ? AND ? AND is_replay = FALSE
    `, [startDate, endDate]);

    // Get top donors from LeaderboardArchive - case insensitive, excluding Anonymous
    const topDonors = await db.query(`
      SELECT name, SUM(amount) as total_amount
      FROM LeaderboardArchive
      WHERE created_at BETWEEN ? AND ? AND LOWER(name) != 'anonymous'
      GROUP BY LOWER(name)
      ORDER BY total_amount DESC
      LIMIT 10
    `, [startDate, endDate]);

    // Get all messages for word analysis (with donor name for per-donor tracking)
    const messages = await db.query(`
      SELECT name, message FROM DonationArchive
      WHERE created_at BETWEEN ? AND ? AND message IS NOT NULL AND message != ''
    `, [startDate, endDate]);

    // Word frequency analysis
    const wordCounts = {};
    const allText = messages.map(m => m.message).join(' ').toLowerCase();

    // Count family mentions
    const familyMentions = {
      minitom: (allText.match(/minitom/gi) || []).length,
      tom: (allText.match(/\btom\b/gi) || []).length,
      mini: (allText.match(/\bmini\b/gi) || []).length,
      family: (allText.match(/family/gi) || []).length,
      senlac: (allText.match(/\bsenlac\b/gi) || []).length,
      storage: (allText.match(/\bstorage\b/gi) || []).length,
      spastic: (allText.match(/\bspastic\b/gi) || []).length,
      retard: (allText.match(/\bretard\b/gi) || []).length,
    };
    familyMentions.total = familyMentions.minitom + familyMentions.tom + familyMentions.mini + familyMentions.family + familyMentions.senlac + familyMentions.storage + familyMentions.spastic + familyMentions.retard;

    // Count "third nostril" mentions
    const thirdNostrilCount = (allText.match(/third nostril/gi) || []).length;

    // Count "alan" mentions (Callum's cat)
    const alanCount = (allText.match(/\balan\b/gi) || []).length;

    // Count "flef" mentions
    const flefCount = (allText.match(/\bflef\b/gi) || []).length;

    const lMatches = allText.match(/\bl+\b/gi) || [];
    const lCount = lMatches.reduce((sum, match) => sum + match.length, 0);

    // Count bald mentions
    const baldMentions = {
      bald: (allText.match(/\bbald\b/gi) || []).length,
      baldy: (allText.match(/\bbaldy\b/gi) || []).length,
      hair: (allText.match(/\bhair\b/gi) || []).length,
    };
    baldMentions.total = baldMentions.bald + baldMentions.baldy + baldMentions.hair;

    // Count "and all that" mentions
    const andAllThatCount = (allText.match(/and all that/gi) || []).length;

    // Count inverted exclamation marks
    const invertedExclamationCount = (allText.match(/¡/g) || []).length;

    // Track per-donor usage of special terms
    const thirdNostrilByDonor = {};
    const alanByDonor = {};
    const flefByDonor = {};
    const lByDonor = {};
    const invertedExclamationByDonor = {};
    const andAllThatByDonor = {};
    const baldByDonor = {};
    const familyByDonor = {};

    messages.forEach(m => {
      const donorKey = m.name.toLowerCase();
      const displayName = m.name;
      const msg = m.message || '';

      // Count third nostril mentions per donor
      const thirdNostrilMatches = (msg.match(/third nostril/gi) || []).length;
      if (thirdNostrilMatches > 0) {
        if (!thirdNostrilByDonor[donorKey]) {
          thirdNostrilByDonor[donorKey] = { name: displayName, count: 0 };
        }
        thirdNostrilByDonor[donorKey].count += thirdNostrilMatches;
      }

      // Count alan mentions per donor
      const alanMatches = (msg.match(/\balan\b/gi) || []).length;
      if (alanMatches > 0) {
        if (!alanByDonor[donorKey]) {
          alanByDonor[donorKey] = { name: displayName, count: 0 };
        }
        alanByDonor[donorKey].count += alanMatches;
      }

      // Count flef mentions per donor
      const flefMatches = (msg.match(/\bflef\b/gi) || []).length;
      if (flefMatches > 0) {
        if (!flefByDonor[donorKey]) {
          flefByDonor[donorKey] = { name: displayName, count: 0 };
        }
        flefByDonor[donorKey].count += flefMatches;
      }

      // Count standalone L's per donor (L's alone or adjacent to other L's)
      const lMatchesPerMsg = msg.match(/\bl+\b/gi) || [];
      const lMatchCount = lMatchesPerMsg.reduce((sum, match) => sum + match.length, 0);
      if (lMatchCount > 0) {
        if (!lByDonor[donorKey]) {
          lByDonor[donorKey] = { name: displayName, count: 0 };
        }
        lByDonor[donorKey].count += lMatchCount;
      }

      // Count inverted exclamation per donor
      const invertedMatches = (msg.match(/¡/g) || []).length;
      if (invertedMatches > 0) {
        if (!invertedExclamationByDonor[donorKey]) {
          invertedExclamationByDonor[donorKey] = { name: displayName, count: 0 };
        }
        invertedExclamationByDonor[donorKey].count += invertedMatches;
      }

      // Count "and all that" per donor
      const andAllThatMatches = (msg.match(/and all that/gi) || []).length;
      if (andAllThatMatches > 0) {
        if (!andAllThatByDonor[donorKey]) {
          andAllThatByDonor[donorKey] = { name: displayName, count: 0 };
        }
        andAllThatByDonor[donorKey].count += andAllThatMatches;
      }

      // Count bald mentions per donor (bald, baldy, hair)
      const baldMatches = (msg.match(/\bbald\b/gi) || []).length +
                          (msg.match(/\bbaldy\b/gi) || []).length +
                          (msg.match(/\bhair\b/gi) || []).length;
      if (baldMatches > 0) {
        if (!baldByDonor[donorKey]) {
          baldByDonor[donorKey] = { name: displayName, count: 0 };
        }
        baldByDonor[donorKey].count += baldMatches;
      }

      // Count family mentions per donor (minitom, tom, mini, family, senlac, storage, spastic, retard)
      const familyMatches = (msg.match(/minitom/gi) || []).length +
                            (msg.match(/\btom\b/gi) || []).length +
                            (msg.match(/\bmini\b/gi) || []).length +
                            (msg.match(/family/gi) || []).length +
                            (msg.match(/\bsenlac\b/gi) || []).length +
                            (msg.match(/\bstorage\b/gi) || []).length +
                            (msg.match(/\bspastic\b/gi) || []).length +
                            (msg.match(/\bretard\b/gi) || []).length;
      if (familyMatches > 0) {
        if (!familyByDonor[donorKey]) {
          familyByDonor[donorKey] = { name: displayName, count: 0 };
        }
        familyByDonor[donorKey].count += familyMatches;
      }
    });

    // Get top 5 users for each
    const thirdNostrilTopUsers = Object.values(thirdNostrilByDonor)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const alanTopUsers = Object.values(alanByDonor)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const flefTopUsers = Object.values(flefByDonor)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const lTopUsers = Object.values(lByDonor)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const invertedExclamationTopUsers = Object.values(invertedExclamationByDonor)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const andAllThatTopUsers = Object.values(andAllThatByDonor)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const baldTopUsers = Object.values(baldByDonor)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const familyTopUsers = Object.values(familyByDonor)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Count all words
    messages.forEach(m => {
      const words = extractWords(m.message);
      words.forEach(word => {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      });
    });

    // Get top words (excluding family-related)
    const topWords = Object.entries(wordCounts)
      .filter(([word]) => !['minitom', 'tom', 'mini', 'family'].includes(word))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([word, count]) => ({ word, count }));

    // Simple phrase detection (2-3 word combinations that appear often)
    // Count unique messages first to avoid spam inflation
    const uniqueMessages = [...new Set(messages.map(m => m.message?.toLowerCase()).filter(Boolean))];

    const phraseCounts = {};
    uniqueMessages.forEach(message => {
      const words = message.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);

      // Track phrases we've seen in THIS message to only count each once per message
      const seenInMessage = new Set();

      // Two-word phrases (skip if both words are the same)
      for (let i = 0; i < words.length - 1; i++) {
        if (words[i] === words[i + 1]) continue; // Skip duplicate word phrases
        const phrase = `${words[i]} ${words[i + 1]}`;
        if (!STOP_WORDS.has(words[i]) || !STOP_WORDS.has(words[i + 1])) {
          // Only count this phrase once per unique message
          if (!seenInMessage.has(phrase)) {
            seenInMessage.add(phrase);
            phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
          }
        }
      }
    });

    const excludedPhrases = ['you re', 'you ve'];
    const topPhrases = Object.entries(phraseCounts)
      .filter(([phrase, count]) => count >= 3 && !excludedPhrases.includes(phrase))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([phrase, count]) => ({ phrase, count }));

    // Get top videos
    const videoData = await db.query(`
      SELECT
        media_url,
        video_title,
        video_thumbnail,
        COUNT(*) as play_count
      FROM MediaArchive
      WHERE created_at BETWEEN ? AND ? AND is_replay = FALSE
      GROUP BY media_url
      ORDER BY play_count DESC
      LIMIT 10
    `, [startDate, endDate]);

    // Fetch top requester and YouTube channel for each video
    const topVideos = await Promise.all(videoData.map(async (v) => {
      // Get top requester for this video
      const topRequesterData = await db.query(`
        SELECT donor_name, COUNT(*) as request_count
        FROM MediaArchive
        WHERE media_url = ? AND created_at BETWEEN ? AND ? AND is_replay = FALSE
        GROUP BY LOWER(donor_name)
        ORDER BY request_count DESC
        LIMIT 1
      `, [v.media_url, startDate, endDate]);

      const videoId = extractVideoId(v.media_url);
      const channelName = videoId ? await getYouTubeChannelName(videoId) : null;

      return {
        ...v,
        video_id: videoId,
        top_requester: topRequesterData[0]?.donor_name || null,
        uploaded_by: channelName
      };
    }));

    // Get busiest day
    const busiestDayData = await db.query(`
      SELECT
        DATE(created_at) as day,
        COUNT(*) as count
      FROM DonationArchive
      WHERE created_at BETWEEN ? AND ? AND is_replay = FALSE
      GROUP BY DATE(created_at)
      ORDER BY count DESC
      LIMIT 1
    `, [startDate, endDate]);

    const busiestDay = busiestDayData[0] ? {
      day: new Date(busiestDayData[0].day).toLocaleDateString('en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      count: busiestDayData[0].count
    } : null;

    // Get busiest hour
    const busiestHourData = await db.query(`
      SELECT
        HOUR(created_at) as hour,
        COUNT(*) as count
      FROM DonationArchive
      WHERE created_at BETWEEN ? AND ? AND is_replay = FALSE
      GROUP BY HOUR(created_at)
      ORDER BY count DESC
      LIMIT 1
    `, [startDate, endDate]);

    const busiestHour = busiestHourData[0] ? {
      hour: `${busiestHourData[0].hour}:00 - ${busiestHourData[0].hour + 1}:00`,
      count: busiestHourData[0].count
    } : null;

    // Average message length (ignoring messages > 255 characters)
    const messagesWithLength = await db.query(`
      SELECT message FROM DonationArchive
      WHERE created_at BETWEEN ? AND ? AND message IS NOT NULL AND message != '' AND LENGTH(message) <= 255
    `, [startDate, endDate]);

    const totalMessageLength = messagesWithLength.reduce((sum, m) => sum + (m.message?.length || 0), 0);
    const avgMessageLength = messagesWithLength.length > 0
      ? Math.round(totalMessageLength / messagesWithLength.length)
      : 0;

    // Most frequent donor (by count, not amount) - case insensitive, excluding Anonymous
    const frequentDonorData = await db.query(`
      SELECT name, COUNT(*) as donation_count
      FROM DonationArchive
      WHERE created_at BETWEEN ? AND ? AND is_replay = FALSE AND LOWER(name) != 'anonymous'
      GROUP BY LOWER(name)
      ORDER BY donation_count DESC
      LIMIT 1
    `, [startDate, endDate]);

    const mostFrequentDonor = frequentDonorData[0] ? {
      name: frequentDonorData[0].name
    } : null;

    // Donation streak king (most consecutive days donating) - case insensitive, excluding Anonymous and me
    const donorDaysData = await db.query(`
      SELECT name, LOWER(name) as name_lower, DATE(created_at) as donation_date
      FROM DonationArchive
      WHERE created_at BETWEEN ? AND ? AND is_replay = FALSE AND LOWER(name) != 'anonymous' AND LOWER(name) != 'matt'
      GROUP BY LOWER(name), DATE(created_at)
      ORDER BY name_lower, donation_date
    `, [startDate, endDate]);

    // Calculate streaks per donor (case insensitive using name_lower)
    const donorStreaks = {};

    donorDaysData.forEach(row => {
      const donorKey = row.name_lower; // Use lowercase for grouping
      const displayName = row.name; // Keep original for display
      const date = new Date(row.donation_date);

      if (!donorStreaks[donorKey]) {
        donorStreaks[donorKey] = { maxStreak: 1, currentStreak: 1, lastDate: date, displayName };
      } else {
        const dayDiff = Math.floor((date - donorStreaks[donorKey].lastDate) / (1000 * 60 * 60 * 24));
        if (dayDiff === 1) {
          donorStreaks[donorKey].currentStreak++;
          if (donorStreaks[donorKey].currentStreak > donorStreaks[donorKey].maxStreak) {
            donorStreaks[donorKey].maxStreak = donorStreaks[donorKey].currentStreak;
          }
        } else if (dayDiff > 1) {
          donorStreaks[donorKey].currentStreak = 1;
        }
        donorStreaks[donorKey].lastDate = date;
      }
    });

    let streakKing = null;
    let longestStreak = 0;
    Object.entries(donorStreaks).forEach(([key, data]) => {
      // Exclude me from streak king
      if (key.toLowerCase() !== 'matt' && data.maxStreak > longestStreak) {
        longestStreak = data.maxStreak;
        streakKing = { name: data.displayName, streak: data.maxStreak };
      }
    });

    // Early bird award (most donations before noon) - case insensitive, excluding me
    const earlyBirdData = await db.query(`
      SELECT name, COUNT(*) as early_count
      FROM DonationArchive
      WHERE created_at BETWEEN ? AND ? AND is_replay = FALSE AND HOUR(created_at) < 12 AND LOWER(name) != 'matt'
      GROUP BY LOWER(name)
      ORDER BY early_count DESC, name ASC
      LIMIT 1
    `, [startDate, endDate]);

    const earlyBird = earlyBirdData[0] ? {
      name: earlyBirdData[0].name,
      count: earlyBirdData[0].early_count
    } : null;

    // Longest donor name - case insensitive (gets longest unique name by lowercase), excluding me
    const longestNameData = await db.query(`
      SELECT name, LENGTH(name) as name_length
      FROM DonationArchive
      WHERE created_at BETWEEN ? AND ? AND is_replay = FALSE AND LOWER(name) != 'matt'
      GROUP BY LOWER(name)
      ORDER BY name_length DESC
      LIMIT 1
    `, [startDate, endDate]);

    const longestName = longestNameData[0] ? {
      name: longestNameData[0].name,
      length: longestNameData[0].name_length
    } : null;

    // Anonymous donation count
    const [anonData] = await db.query(`
      SELECT COUNT(*) as anon_count
      FROM DonationArchive
      WHERE created_at BETWEEN ? AND ? AND is_replay = FALSE
        AND (LOWER(name) = 'anonymous' OR LOWER(name) LIKE 'anon%')
    `, [startDate, endDate]);

    const anonymousDonations = parseInt(anonData?.anon_count) || 0;

    // Count Twitch sign-ins for the year
    const [twitchSignIns] = await db.query(`
      SELECT COUNT(*) as count
      FROM TwitchAuth
      WHERE created_at BETWEEN ? AND ?
    `, [startDate, endDate]);
    const twitchSignInCount = parseInt(twitchSignIns?.count) || 0;

    // Biggest cheapskate - sum all bits credits per person, divide by 2.22 and round down for free donations count
    const cheapskateData = await db.query(`
      SELECT ta.display_name, ta.username, SUM(fdc.amount_available) as total_bits
      FROM FreeDonationCredits fdc
      JOIN TwitchAuth ta ON fdc.twitch_auth_id = ta.id
      WHERE fdc.credit_type = 'bits'
        AND LOWER(ta.username) NOT IN ('skyera1n', 'spaff master', 'spaffmaster', 'spaff_master', 'BlogTV_')
        AND LOWER(ta.display_name) NOT IN ('skyera1n', 'spaff master', 'spaffmaster', 'spaff_master', 'BlogTV_')
      GROUP BY ta.id, ta.display_name, ta.username
      ORDER BY total_bits DESC, ta.username ASC
      LIMIT 1
    `);

    const biggestCheapskate = cheapskateData[0] ? {
      name: cheapskateData[0].display_name || cheapskateData[0].username,
      count: Math.floor(cheapskateData[0].total_bits / 2.22)
    } : null;

    res.status(200).json({
      year,
      totalDonations: parseInt(archiveStats?.total_donations) || 0,
      totalAmount: parseFloat(archiveStats?.total_amount) || 0,
      uniqueDonors: parseInt(archiveStats?.unique_donors) || 0,
      averageDonation: parseFloat(archiveStats?.avg_donation) || 0,
      totalVideos: parseInt(mediaStats?.total_videos) || 0,
      topDonors,
      topVideos,
      topWords,
      topPhrases,
      familyMentions,
      baldMentions,
      andAllThatCount,
      busiestDay,
      busiestHour,
      // New stats
      avgMessageLength,
      mostFrequentDonor,
      streakKing,
      earlyBird,
      longestName,
      anonymousDonations,
      twitchSignInCount,
      biggestCheapskate,
      thirdNostrilCount,
      thirdNostrilTopUsers,
      alanCount,
      alanTopUsers,
      flefCount,
      flefTopUsers,
      lCount,
      lTopUsers,
      invertedExclamationCount,
      invertedExclamationTopUsers,
      andAllThatTopUsers,
      baldTopUsers,
      familyTopUsers,
    });

  } catch (error) {
    console.error('Rewind stats error:', error);
    res.status(500).json({ error: 'Failed to fetch rewind stats' });
  }
}

module.exports = cors(handler);
