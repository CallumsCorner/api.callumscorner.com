// there is a rewrite on the way for this
// its messy atm, its a colation of various attempts to make tts more reliable when i started this project
// check the readme.md for the ideas.


const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('../../lib/cors');
const rateLimiter = require('../../lib/rateLimiter'); 

async function generateTTSWithPolly(text, options = {}) {
  try {
    // Check if AWS credentials are available
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('gimp!!!!! you forgot to set aws creds!!!!');
    }

    console.log('aws creds check:', {
      accessKeyExists: !!process.env.AWS_ACCESS_KEY_ID,
      secretExists: !!process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1'
    });

    console.log('Importing AWS SDK...');
    const AWS = await import('aws-sdk');
    
    console.log('Configuring Polly client...');
    // Configure AWS
    const polly = new AWS.default.Polly({
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });

    const params = {
      Text: text,
      OutputFormat: 'mp3',
      VoiceId: options.voice || 'Brian', // CLASSIC
      Engine: 'standard',
      LanguageCode: 'en-GB', // British English. NOT MIXED RACE. BRITISH
      TextType: 'text'
    };

    //console.log('Polly params:', params);
    console.log('Making Polly API call...');

    const result = await polly.synthesizeSpeech(params).promise();
    
    console.log('Polly API call completed. Result keys:', Object.keys(result));
    
    if (result.AudioStream) {
      console.log('AudioStream received, size:', result.AudioStream.length);
      return result.AudioStream;
    } else {
      throw new Error('No audio stream returned from Polly');
    }
  } catch (error) {
    console.error('Amazon Polly error details:', {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      stack: error.stack
    });
    throw error;
  }
}


// This is basically never used. I used it to test before implementing Polly. TO be honest i would rather TTS fail
// than use google translate tts because its crap and Brian is irreplacable.
async function generateTTSWithGoogleTranslate(text, language = 'en') {
  try {
    const encodedText = encodeURIComponent(text);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=${language}&client=tw-ob`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.arrayBuffer();
  } catch (error) {
    console.error('Google TTS error:', error);
    throw error;
  }
}

const formatTTSText = (donation, ttsSettings) => {
  const mainParts = [];
  let message = '';
  
  if (ttsSettings.ttsReadNames) {
    mainParts.push(donation.name || 'Anonymous');
  }
  
  if (ttsSettings.ttsReadAmounts) {
    const amount = parseFloat(donation.amount);
    const currency = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(amount);
    mainParts.push(`tipped ${currency}`);
  }
  
  if (ttsSettings.ttsReadMessages && donation.message) {
    let messageText = donation.message.trim();
    if (messageText.length > ttsSettings.ttsMaxMessageLength) {
      messageText = messageText.substring(0, ttsSettings.ttsMaxMessageLength) + '...';
    }
    message = messageText;
  }
  
  // Join name and amount smoothly, then add message with a pause
  const mainText = mainParts.join(' ');
  
  if (message) {
    return `${mainText}. ${message}`;
  } else {
    return mainText;
  }
};
const getPollyVoice = (language, voicePreference) => {
  const voiceMap = {
    'en-GB': {
      'male': 'Brian',      // British English male
      'female': 'Emma',     // British English female
      'default': 'Brian'
    },
    'en-US': {
      'male': 'Matthew',    // US English male
      'female': 'Joanna',   // US English female
      'default': 'Matthew'
    },
    'en-AU': {
      'male': 'Russell',    // Australian English male
      'female': 'Nicole',   // Australian English female
      'default': 'Russell'
    },
    'en-IN': {
      'female': 'Aditi',    // Indian English female
      'female2': 'Raveena', // Indian English female (alternative)
      'default': 'Aditi'
    },
    'de-DE': {
      'male': 'Hans',       // German male
      'female': 'Marlene',  // German female
      'female2': 'Vicki',   // German female (alternative)
      'default': 'Hans'
    }
  };

  const lang = language || 'en-GB';
  const voice = voicePreference || 'default';

  return voiceMap[lang]?.[voice] || voiceMap['en-GB']['default'];
};

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting - 5 requests per minute per IP for TTS preview
  const rateLimitResult = rateLimiter.isRateLimited(req, {
    windowMs: 60000, // 1 minute
    maxRequests: 15   // 15 TTS generations per minute per IP
  });

  if (rateLimitResult.isLimited) {
    console.log(`Rate limited IP: ${rateLimitResult.clientIP} (${rateLimitResult.count}/${rateLimitResult.maxRequests})`);
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many TTS requests. Please wait before trying again.',
      retryAfter: rateLimitResult.retryAfter,
      clientIP: rateLimitResult.clientIP
    });
  }

  console.log(`Request from IP: ${rateLimitResult.clientIP} (${rateLimitResult.count}/${rateLimitResult.maxRequests})`);

  try {
    const { text, language, voice, quality } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Check if this is a privileged request (from admin/overlay hidden URLs)
    const referer = req.headers.referer || '';
    const adminUrl = 'https://SECRETADMINSUBDOMAIN.admin.callumscorner.com/';
    const overlayUrl = 'https://SECRETOVERLAYSUBDOMAIN.overlay.callumscorner.com/';
    const isPrivileged = referer.startsWith(adminUrl) || referer.startsWith(overlayUrl);

    // Apply restrictions for unprivileged requests. this is basically to stop random people
    // abusing the public api for a free tts service.
    if (!isPrivileged) {
      // Increment TTS preview counter for non-privileged requests (for rewind stats collection)
      const db = require('../../lib/database');
      db.query(`UPDATE Settings SET setting_value = setting_value + 1 WHERE setting_key = 'rewindTTSPreviewCount'`).catch(() => {});

      // Max 285 characters for unprivileged (name limit + tipped amount limit + message limit + a buffer for larger amounts)
      if (text.length > 295) {
        return res.status(400).json({ error: 'Text too long (max 285 characters)' });
      }

      // Must contain the word "tipped" for unprivileged
      if (!text.toLowerCase().includes('tipped')) {
        return res.status(400).json({ error: 'Invalid TTS request' });
      }
    }

    // Privileged requests can have up to 1000 characters
    if (text.length > 1000) {
      return res.status(400).json({ error: 'Text too long (max 1000 characters)' });
    }

    // Fetch current TTS settings from database
    const db = require('../../lib/database');
    
    const currentTtsEnabled = await db.getSetting('ttsEnabled');
    const currentTtsVoice = await db.getSetting('ttsVoice');
    const currentTtsLanguage = await db.getSetting('ttsLanguage');
    const currentTtsQuality = await db.getSetting('ttsQuality');
    const currentTtsProvider = await db.getSetting('ttsProvider');
    
    // Use database settings, with request parameters as fallback
    const finalLanguage = currentTtsLanguage || language || 'en-GB';
    const finalVoice = currentTtsVoice || voice || 'default';
    const finalQuality = currentTtsQuality || quality || 'high';
    const finalProvider = currentTtsProvider || 'auto';
    
    console.log('Generating TTS:', {
      text,
      language: finalLanguage,
      voice: finalVoice,
      quality: finalQuality,
      provider: finalProvider,
      ttsEnabled: currentTtsEnabled
    });

    // Check if TTS is enabled
    if (currentTtsEnabled !== 'true') {
      return res.status(400).json({
        success: false,
        error: 'TTS is disabled',
        fallback: true,
        message: 'TTS has been disabled in admin settings'
      });
    }

    // Create TTS directory if it doesn't exist
    const ttsDir = path.join(process.cwd(), 'public', 'uploads', 'tts');
    if (!fs.existsSync(ttsDir)) {
      fs.mkdirSync(ttsDir, { recursive: true });
    }

    // unique filename
    const filename = `tts_${uuidv4()}.mp3`;
    const filePath = path.join(ttsDir, filename);

    let audioBuffer = null;
    let ttsProvider = 'unknown';

    // check creds
    const hasAWSCredentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
    
    console.log('TTS Configuration:', {
      quality: finalQuality,
      provider: finalProvider,
      hasAWSCredentials,
      awsAccessKeyExists: !!process.env.AWS_ACCESS_KEY_ID,
      awsSecretExists: !!process.env.AWS_SECRET_ACCESS_KEY
    });

    // which tts provider?
    if (finalProvider === 'polly' || (finalProvider === 'auto' && (finalQuality === 'high' || finalQuality === 'premium') && hasAWSCredentials)) {
      try {
        console.log('Attempting Amazon Polly TTS...');
        
        const pollyVoice = getPollyVoice(finalLanguage, finalVoice);
        audioBuffer = await generateTTSWithPolly(text, { 
          voice: pollyVoice,
          language: finalLanguage 
        });
        ttsProvider = 'Amazon Polly';
        
        console.log(`Amazon Polly TTS generated successfully using voice: ${pollyVoice}`);
        
      } catch (error) {
        console.error('Amazon Polly failed:', error.message);
        console.error('Full Polly error:', error);
        
        // If Polly fails, fall back to Google (unless premium requested or polly-only - which should be true)
        if (finalQuality !== 'premium' && finalProvider !== 'polly') {
          console.log('Falling back to Google Translate TTS...');
          try {
            const langCode = finalLanguage.split('-')[0];
            audioBuffer = await generateTTSWithGoogleTranslate(text, langCode);
            ttsProvider = 'Google Translate';
          } catch (googleError) {
            console.warn('Google TTS also failed:', googleError.message);
          }
        }
      }
    } else if (finalProvider === 'google' || (finalProvider === 'auto' && (!hasAWSCredentials || finalQuality === 'standard'))) {
      try {
        console.log('Using Google Translate TTS...');
        const langCode = finalLanguage.split('-')[0];
        audioBuffer = await generateTTSWithGoogleTranslate(text, langCode);
        ttsProvider = 'Google Translate';
      } catch (error) {
        console.warn('Google TTS failed:', error.message);
        
        // Try Polly as fallback if available
        if (hasAWSCredentials && finalProvider === 'auto') {
          try {
            console.log('Falling back to Amazon Polly...');
            const pollyVoice = getPollyVoice(finalLanguage, finalVoice);
            audioBuffer = await generateTTSWithPolly(text, { 
              voice: pollyVoice,
              language: finalLanguage 
            });
            ttsProvider = 'Amazon Polly';
          } catch (pollyError) {
            console.warn('Polly fallback also failed:', pollyError.message);
          }
        }
      }
    } else if (finalProvider === 'browser') {
      // Browser TTS requested - return fallback response
      return res.status(500).json({ 
        success: false,
        error: 'Browser TTS requested',
        fallback: true,
        message: 'Server could not generate TTS, use browser TTS fallback!',
        provider: 'browser'
      });
    } else {
      console.warn('Unknown provider or no valid provider available');
    }

    if (!audioBuffer) {
      return res.status(500).json({ 
        success: false,
        error: 'TTS generation failed',
        fallback: true,
        message: 'All TTS services unavailable, use browser TTS fallback!',
        provider: 'none'
      });
    }

    // Save audio file
    fs.writeFileSync(filePath, Buffer.from(audioBuffer));

    // Get file size
    const stats = fs.statSync(filePath);

    // Clean up old TTS files (older than 2 hours)
    try {
      const files = fs.readdirSync(ttsDir);
      const now = Date.now();
      let cleanedCount = 0;
      
      files.forEach(file => {
        if (file.startsWith('tts_') && file.endsWith('.mp3')) {
          const fileePath = path.join(ttsDir, file);
          const fileStats = fs.statSync(fileePath);
          if (now - fileStats.mtime.getTime() > 2 * 60 * 60 * 1000) { // 2 hours
            fs.unlinkSync(fileePath);
            cleanedCount++;
          }
        }
      });
      
      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} old TTS files`);
      }
    } catch (cleanupError) {
      console.warn('TTS cleanup error:', cleanupError);
    }

    console.log(`TTS generated successfully: ${filename} (${stats.size} bytes) via ${ttsProvider}`);

    res.status(200).json({
      success: true,
      filename: filename,
      url: `https://api.callumscorner.com/uploads/tts/${filename}`,
      text: text,
      language: finalLanguage,
      voice: finalVoice,
      provider: ttsProvider,
      size: stats.size,
      quality: finalQuality
    });

  } catch (error) {
    console.error('TTS generation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate TTS',
      fallback: true,
      message: error.message,
      provider: 'error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

module.exports = cors(handler);
