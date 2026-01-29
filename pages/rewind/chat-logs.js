const cors = require('../../lib/cors');
const { getSessionUser } = require('../../lib/auth');
const fs = require('fs');
const path = require('path');

// Path to chat logs folder
const CHAT_LOGS_DIR = path.join(process.cwd(), 'chatLogs');
const CACHE_FILE = path.join(process.cwd(), 'chatLogsCache.json');

// Default empty response
const EMPTY_RESPONSE = {
  totalMessages: 0,
  totalFiles: 0,
  topChatters: [],
  topEmotes: [],
  busiestStream: null,
  latestStreamBeforeNoon: null,
  averageMessagesPerStream: 0,
  pooCount: 0,
  cmonBruhCount: 0,
  capsLockMessages: 0,
  capsLockPercentage: 0,
  topCopypastas: [],
  cachedAt: null,
  message: 'No data available'
};

// Load cached data
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading chat logs cache:', error);
  }
  return null;
}

// Save cache
function saveCache(data) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving chat logs cache:', error);
  }
}

// Analyze chat logs (expensive operation)
function analyzeChatLogs() {
  // Check if chatLogs directory exists
  if (!fs.existsSync(CHAT_LOGS_DIR)) {
    return { ...EMPTY_RESPONSE, message: 'Chat logs directory not found' };
  }

  // Get all .log files
  const logFiles = fs.readdirSync(CHAT_LOGS_DIR).filter(f => f.endsWith('.log'));

  if (logFiles.length === 0) {
    return { ...EMPTY_RESPONSE, message: 'No log files found' };
  }

  // Helper to parse filename like "2025-03-23_200256.log" into a readable date
  const parseStreamDate = (filename) => {
    const match = filename.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})\.log$/);
    if (match) {
      const [, year, month, day, hour, min] = match;
      const date = new Date(year, month - 1, day, hour, min);
      const dayNum = parseInt(day);
      const suffix = dayNum === 1 || dayNum === 21 || dayNum === 31 ? 'st' :
                     dayNum === 2 || dayNum === 22 ? 'nd' :
                     dayNum === 3 || dayNum === 23 ? 'rd' : 'th';
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                         'July', 'August', 'September', 'October', 'November', 'December'];
      const hours = date.getHours();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const hour12 = hours % 12 || 12;
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${dayNum}${suffix} ${monthNames[date.getMonth()]} ${year} at ${hour12}:${minutes} ${ampm}`;
    }
    return filename.replace('.log', '');
  };

  // Parse all log files
  let totalMessages = 0;
  let pooCount = 0;
  let cmonBruhCount = 0;
  let capsLockMessages = 0;
  const chatterCounts = {};
  const emoteCounts = {};
  const streamMessageCounts = {};
  const streamDates = {};
  const messageCounts = {};

  // Common Twitch emotes to look for
  const commonEmotes = [
    'Kappa', 'PogChamp', 'LUL', 'OMEGALUL', 'KEKW', 'Kreygasm', 'PepeHands',
    'monkaS', 'monkaW', 'POGGERS', 'PepeLaugh', 'Sadge', 'FeelsBadMan',
    'FeelsGoodMan', 'FeelsStrongMan', 'forsenCD', 'xqcL', '4Head', 'EZ',
    'Jebaited', 'NotLikeThis', 'BibleThump', 'ResidentSleeper', 'TriHard',
    'CoolStoryBob', 'DansGame', 'WutFace', 'Pepega', 'widepeepoHappy',
    'peepoSad', 'peepoHappy', 'LULW', 'PepegaAim', 'ICANT', 'Aware',
    'Clueless', 'forsenE', 'gachiHYPER', 'gachiGASM', 'HandsUp', 'catJAM',
    'cmonBruh', 'fbblock', 'steven531storage', 'thetarfu', 'brokeback',
    'dinodance', 'thefor142anele_hf', 'bcwarrior', 'callum178back', 'anele',
    'VoteNay', 'KappaPride',
    'thefor142darkness', 'mercywing1', 'opieop', 'onehand', 'mercywing2',
    'callum178left', 'callum178middle', 'callum178right', 'callum17mega',
    'callum178cl', 'callum178cr', 'callum178cd'
  ];

  const botAccounts = ['streamelements', 'nightbot', 'moobot', 'streamlabs', 'botfromthecorner'];

  for (const logFile of logFiles) {
    const filePath = path.join(CHAT_LOGS_DIR, logFile);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    const streamKey = logFile.replace('.log', '');
    streamMessageCounts[streamKey] = lines.length;
    streamDates[streamKey] = parseStreamDate(logFile);
    totalMessages += lines.length;

    for (const line of lines) {
      const match = line.match(/(?:\[.*?\]\s*)?([^:]+):\s*(.+)/);
      if (match) {
        const username = match[1].trim().toLowerCase();
        const message = match[2];

        if (botAccounts.includes(username)) {
          continue;
        }

        if (username && username.length > 0 && username.length < 50) {
          chatterCounts[username] = (chatterCounts[username] || 0) + 1;
        }

        for (const emote of commonEmotes) {
          const emoteRegex = new RegExp(`\\b${emote}\\b`, 'gi');
          const matches = message.match(emoteRegex);
          if (matches) {
            emoteCounts[emote] = (emoteCounts[emote] || 0) + matches.length;
          }
        }

        const pooMatches = message.match(/\bpoo\b/gi);
        if (pooMatches) {
          pooCount += pooMatches.length;
        }

        const cmonBruhMatches = message.match(/\bcmonBruh\b/gi);
        if (cmonBruhMatches) {
          cmonBruhCount += cmonBruhMatches.length;
        }

        const letters = message.replace(/[^a-zA-Z]/g, '');
        if (letters.length >= 5) {
          const uppercaseLetters = message.replace(/[^A-Z]/g, '');
          if (uppercaseLetters.length / letters.length >= 0.7) {
            capsLockMessages++;
          }
        }

        const normalisedMessage = message.trim().toLowerCase().replace(/[.!?,;:]+$/, '');
        // Only count messages with actual letter content (not just punctuation/numbers/spaces)
        const letterContent = normalisedMessage.replace(/[^a-z]/g, '');
        if (normalisedMessage.length >= 20 && letterContent.length >= 10) {
          const words = normalisedMessage.split(/\s+/).filter(w => w.length > 0);
          const uniqueWords = new Set(words);
          if (uniqueWords.size > 1) {
            const emoteSet = new Set(commonEmotes.map(e => e.toLowerCase()));
            const nonEmoteWords = [...uniqueWords].filter(w => !emoteSet.has(w));
            if (nonEmoteWords.length > 0) {
              messageCounts[normalisedMessage] = (messageCounts[normalisedMessage] || 0) + 1;
            }
          }
        }
      }
    }
  }

  // emote image urls
  // massive big up to fozzy for helpinhg me find some. 
  // took me fuckin ages to find all these
  const emoteImages = {
    'Kappa': 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/3.0',
    'PogChamp': 'https://static-cdn.jtvnw.net/emoticons/v2/305954156/default/dark/3.0',
    '4Head': 'https://static-cdn.jtvnw.net/emoticons/v2/354/default/dark/3.0',
    'Kreygasm': 'https://static-cdn.jtvnw.net/emoticons/v2/41/default/dark/3.0',
    'BibleThump': 'https://static-cdn.jtvnw.net/emoticons/v2/86/default/dark/3.0',
    'ResidentSleeper': 'https://static-cdn.jtvnw.net/emoticons/v2/245/default/dark/3.0',
    'Jebaited': 'https://static-cdn.jtvnw.net/emoticons/v2/114836/default/dark/3.0',
    'NotLikeThis': 'https://static-cdn.jtvnw.net/emoticons/v2/58765/default/dark/3.0',
    'TriHard': 'https://static-cdn.jtvnw.net/emoticons/v2/120232/default/dark/3.0',
    'CoolStoryBob': 'https://static-cdn.jtvnw.net/emoticons/v2/123171/default/dark/3.0',
    'DansGame': 'https://static-cdn.jtvnw.net/emoticons/v2/33/default/dark/3.0',
    'WutFace': 'https://static-cdn.jtvnw.net/emoticons/v2/28087/default/dark/3.0',
    'LUL': 'https://static-cdn.jtvnw.net/emoticons/v2/425618/default/dark/3.0',
    'HeyGuys': 'https://static-cdn.jtvnw.net/emoticons/v2/30259/default/dark/3.0',
    'OMEGALUL': 'https://cdn.betterttv.net/emote/583089f4737a8e61abb0186b/3x',
    'KEKW': 'https://cdn.betterttv.net/emote/5e9c6c187e090362f8b0b9e8/3x',
    'PepeHands': 'https://cdn.betterttv.net/emote/59f27b3f4ebd8047f54dee29/3x',
    'monkaS': 'https://cdn.betterttv.net/emote/56e9f494fff3cc5c35e5287e/3x',
    'monkaW': 'https://cdn.betterttv.net/emote/5a6edb51f730010d194bdd46/3x',
    'POGGERS': 'https://cdn.betterttv.net/emote/58ae8407ff7b7276f8e594f2/3x',
    'PepeLaugh': 'https://cdn.betterttv.net/emote/59b73909b27c823d5b1f6052/3x',
    'Sadge': 'https://cdn.betterttv.net/emote/5e0fa9d40550d42106b8a489/3x',
    'FeelsBadMan': 'https://cdn.betterttv.net/emote/566c9fc265dbbdab32ec053b/3x',
    'FeelsGoodMan': 'https://cdn.betterttv.net/emote/566c9fde65dbbdab32ec053e/3x',
    'FeelsStrongMan': 'https://cdn.betterttv.net/emote/5b490e73cf46791f8491f6f4/3x',
    'forsenCD': 'https://cdn.betterttv.net/emote/5b4a5f43f3fc8b0b7d64a85a/3x',
    'xqcL': 'https://cdn.betterttv.net/emote/5d63e543375afb1da9a68a5a/3x',
    'EZ': 'https://cdn.betterttv.net/emote/5590b223b344e2c42a9e28e3/3x',
    'Pepega': 'https://cdn.betterttv.net/emote/5aca62163e290877a25481ad/3x',
    'widepeepoHappy': 'https://cdn.betterttv.net/emote/5c0e8ba04461a7455a0b31b4/3x',
    'peepoSad': 'https://cdn.betterttv.net/emote/5c857788f779543bcdf37124/3x',
    'peepoHappy': 'https://cdn.betterttv.net/emote/5a16ee718c22a247ead62d4a/3x',
    'LULW': 'https://cdn.betterttv.net/emote/5dc79d1b9b1b3d772b8a67eb/3x',
    'PepegaAim': 'https://cdn.betterttv.net/emote/5d3c5b922e70544b78281f72/3x',
    'ICANT': 'https://cdn.betterttv.net/emote/61e9e06e06fd6a9f5be286b0/3x',
    'Aware': 'https://cdn.betterttv.net/emote/61132296af28e956864b98ea/3x',
    'Clueless': 'https://cdn.betterttv.net/emote/60afa8bbb254a103d9729dfa/3x',
    'forsenE': 'https://cdn.betterttv.net/emote/5821a72f5071ca467f1d56d8/3x',
    'gachiHYPER': 'https://cdn.betterttv.net/emote/59143b496996b360ff9b807c/3x',
    'gachiGASM': 'https://cdn.betterttv.net/emote/55999813f0db38ef6c7c663e/3x',
    'HandsUp': 'https://cdn.betterttv.net/emote/5b6c5efadd8fb0185163bd4f/3x',
    'catJAM': 'https://cdn.betterttv.net/emote/5f1b0186cf6d2144653d2970/3x',
    'cmonBruh': 'https://static-cdn.jtvnw.net/emoticons/v2/84608/default/dark/4.0',
    'brokeback': 'https://static-cdn.jtvnw.net/emoticons/v2/4057/default/dark/4.0',
    'dinodance': 'https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_dcd06b30a5c24f6eb871e8f5edbd44f7/default/dark/4.0',
    'thetarfu': 'https://static-cdn.jtvnw.net/emoticons/v2/111351/default/dark/2.0',
    'fbblock': 'https://cdn.7tv.app/emote/01H34M7Z40000DJXRR92CC1079/2x.avif',
    'VoteNay': 'https://static-cdn.jtvnw.net/emoticons/v2/106294/default/dark/3.0',
    'KappaPride': 'https://static-cdn.jtvnw.net/emoticons/v2/55338/default/dark/3.0',
    'callum178cl': 'https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_5ec8b34cf9cd4e2e9ef2fe5db11a7dc8/default/dark/3.0',
    'anele': '/anele.png',
    'steven531storage': '/storage.png',
  };

  const topChatters = Object.entries(chatterCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  const topEmotes = Object.entries(emoteCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([emote, count]) => ({ emote, count, image: emoteImages[emote] || null }));

  const busiestStreamEntry = Object.entries(streamMessageCounts)
    .sort((a, b) => b[1] - a[1])[0];
  const busiestStream = busiestStreamEntry
    ? { name: streamDates[busiestStreamEntry[0]], count: busiestStreamEntry[1] }
    : null;

  // Find stream that started latest BEFORE midnight (closest to 11:59 PM)
  let latestStreamBeforeMidnight = null;
  let latestTimeBeforeMidnight = -1;

  logFiles.forEach(logFile => {
    const match = logFile.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})\.log$/);
    if (match) {
      const hour = parseInt(match[4]);
      const minute = parseInt(match[5]);
      const second = parseInt(match[6]);

      const timeInSeconds = hour * 3600 + minute * 60 + second;
      const midnightInSeconds = 24 * 3600; // 86400 seconds

      // find the latest time that's still before midnight
      if (timeInSeconds < midnightInSeconds && timeInSeconds > latestTimeBeforeMidnight) {
        latestTimeBeforeMidnight = timeInSeconds;
        latestStreamBeforeMidnight = {
          name: streamDates[logFile.replace('.log', '')],
          hour: hour
        };
      }
    }
  });

  const latestStreamBeforeNoon = latestStreamBeforeMidnight;

  const averageMessagesPerStream = logFiles.length > 0
    ? Math.round(totalMessages / logFiles.length)
    : 0;

  const capsLockPercentage = totalMessages > 0
    ? Math.round((capsLockMessages / totalMessages) * 100)
    : 0;

  const topCopypastas = Object.entries(messageCounts)
    .filter(([, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([message, count]) => ({
      message: message.length > 100 ? message.substring(0, 100) + '...' : message,
      fullMessage: message,
      count
    }));

  return {
    totalMessages,
    totalFiles: logFiles.length,
    topChatters,
    topEmotes,
    busiestStream,
    latestStreamBeforeNoon,
    averageMessagesPerStream,
    pooCount,
    cmonBruhCount,
    capsLockMessages,
    capsLockPercentage,
    topCopypastas,
    cachedAt: new Date().toISOString(),
  };
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const refresh = req.query.refresh === 'true';

    if (refresh) {
      // need auth to refresh
      const user = await getSessionUser(req);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin authentication required to refresh chat logs' });
      }

      // Re-analyze and cache
      console.log('Refreshing chat logs analysis...');
      const startTime = Date.now();
      const data = analyzeChatLogs();
      saveCache(data);
      const elapsed = Date.now() - startTime;
      console.log(`Analysis complete in ${elapsed}ms`);
      return res.status(200).json({ ...data, refreshed: true, analysisTime: elapsed });
    }

    // Return cached data
    const cached = loadCache();
    if (cached) {
      return res.status(200).json({ ...cached, fromCache: true });
    }

    // No cache exists, return empty response with message
    return res.status(200).json({
      ...EMPTY_RESPONSE,
      message: 'No cached data. Call with ?refresh=true to analyze chat logs.'
    });

  } catch (error) {
    console.error('Chat logs error:', error);
    res.status(500).json({ error: 'Failed to fetch chat logs stats' });
  }
}

module.exports = cors(handler);
