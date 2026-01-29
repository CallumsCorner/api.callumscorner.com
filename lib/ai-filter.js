const NodeCache = require('node-cache');
const crypto = require('crypto');
const stringSimilarity = require('string-similarity');
const metaphone = require('talisman/phonetics/metaphone');
const soundex = require('talisman/phonetics/soundex');
const doubleMetaphone = require('talisman/phonetics/double-metaphone');

const AI_SERVER_URL = 'http://10.0.0.6:8080';
const AI_MODEL = 'llama-3.2-3b-instruct'; // example local model. I use a more advanced local model

console.log(`Using local AI server at ${AI_SERVER_URL}`);

const cache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

const stats = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  phoneticMatches: 0,
  aiConsults: 0,
  aiSuccesses: 0,
  aiFailures: 0,
  fallbackActivations: 0,
  totalResponseTime: 0
};

function getCacheKey(message, bannedWords) {
  const data = `${message}|${bannedWords.join(',')}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getPhoneticCodes(text) {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);

  return words.map(word => {
    try {
      const metaphoneCode = metaphone(word) || '';
      const soundexCode = soundex(word) || '';
      const doubleMetaphoneCode = doubleMetaphone(word) || ['', ''];

      return {
        original: word,
        metaphone: metaphoneCode,
        soundex: soundexCode,
        doubleMetaphone: Array.isArray(doubleMetaphoneCode) ? doubleMetaphoneCode : [doubleMetaphoneCode, '']
      };
    } catch (error) {
      console.error(`[Phonetic checks] Error processing word "${word}":`, error.message);
      return {
        original: word,
        metaphone: '',
        soundex: '',
        doubleMetaphone: ['', '']
      };
    }
  });
}

function calculatePhoneticSimilarity(message, bannedWord) {
  const messageCodes = getPhoneticCodes(message);
  const bannedCodes = getPhoneticCodes(bannedWord);

  // For multi-word banned terms, check consecutive word sequences
  if (bannedCodes.length > 1) {
    return checkMultiWordMatch(messageCodes, bannedCodes);
  }

  // Single word - check if any word in message matches
  const bannedCode = bannedCodes[0];
  let bestMatch = 0;

  for (const msgCode of messageCodes) {
    // Check metaphone match
    if (msgCode.metaphone === bannedCode.metaphone) {
      bestMatch = Math.max(bestMatch, 95);
    }

    // Check soundex match
    if (msgCode.soundex === bannedCode.soundex) {
      bestMatch = Math.max(bestMatch, 90);
    }

    // Check double metaphone match
    if (msgCode.doubleMetaphone[0] === bannedCode.doubleMetaphone[0]) {
      bestMatch = Math.max(bestMatch, 93);
    }

    // String similarity as fallback
    const strSim = stringSimilarity.compareTwoStrings(
      msgCode.original,
      bannedCode.original
    ) * 100;
    bestMatch = Math.max(bestMatch, strSim);
  }

  return bestMatch;
}

function checkMultiWordMatch(messageCodes, bannedCodes) {
  if (messageCodes.length < bannedCodes.length) {
    return 0;
  }

  let bestMatch = 0;

  // Check all possible consecutive sequences
  for (let i = 0; i <= messageCodes.length - bannedCodes.length; i++) {
    let sequenceScore = 0;
    let matches = 0;

    for (let j = 0; j < bannedCodes.length; j++) {
      const msgCode = messageCodes[i + j];
      const bannedCode = bannedCodes[j];

      // Check if this word matches
      let wordScore = 0;

      if (msgCode.metaphone === bannedCode.metaphone) {
        wordScore = 95;
      } else if (msgCode.soundex === bannedCode.soundex) {
        wordScore = 90;
      } else if (msgCode.doubleMetaphone[0] === bannedCode.doubleMetaphone[0]) {
        wordScore = 93;
      } else {
        wordScore = stringSimilarity.compareTwoStrings(
          msgCode.original,
          bannedCode.original
        ) * 100;
      }

      if (wordScore > 50) {
        matches++;
        sequenceScore += wordScore;
      }
    }

    // If all words matched reasonably well
    if (matches === bannedCodes.length) {
      const avgScore = sequenceScore / bannedCodes.length;
      bestMatch = Math.max(bestMatch, avgScore);
    }
  }

  return bestMatch;
}

async function hybridPhoneticCheck(message, bannedWords, strictness) {
  const threshold = strictness <= 30 ? 80 : strictness <= 70 ? 60 : 40;
  const directMatchThreshold = threshold + 10; // Instant match above this
  const borderlineMin = threshold - 5; // Consult AI for this range

  const matches = [];
  const borderlineCases = [];

  console.log(`Checking message: "${message}"`);
  console.log(`Threshold: ${threshold}%, Direct match at: ${directMatchThreshold}%, Borderline: ${borderlineMin}%-${directMatchThreshold}%`);

  // First pass: phonetic algorithms
  for (const bannedWord of bannedWords) {
    const similarity = calculatePhoneticSimilarity(message, bannedWord);

    console.log(`"${bannedWord}" similarity: ${similarity.toFixed(1)}%`);

    if (similarity >= directMatchThreshold) {
      // Clear match via phonetics
      matches.push({
        word: bannedWord,
        confidence: Math.round(similarity),
        method: 'phonetic'
      });
      stats.phoneticMatches++;
    } else if (similarity >= borderlineMin && similarity < directMatchThreshold) {
      // Borderline - ask AI (includes cases at threshold)
      borderlineCases.push({
        word: bannedWord,
        similarity: similarity
      });
    }
  }

  // Second pass: consult AI for borderline cases
  if (borderlineCases.length > 0 && borderlineCases.length <= 3) {
    console.log(`${borderlineCases.length} borderline cases, consulting AI...`);
    stats.aiConsults++;

    const aiResult = await consultAI(message, borderlineCases.map(c => c.word), strictness);

    if (aiResult.success && aiResult.containsBanned) {
      // Add AI-confirmed matches
      for (const matchedWord of aiResult.matchedWords) {
        if (!matches.find(m => m.word === matchedWord)) {
          matches.push({
            word: matchedWord,
            confidence: aiResult.confidence,
            method: 'ai-assisted'
          });
        }
      }
    }
  }

  return {
    containsBanned: matches.length > 0,
    matches: matches,
    matchedWords: matches.map(m => m.word),
    confidence: matches.length > 0 ? Math.max(...matches.map(m => m.confidence)) : 0,
    reasoning: matches.length > 0
      ? `Matched via ${matches.map(m => `${m.word} (${m.method})`).join(', ')}`
      : 'No phonetic matches found'
  };
}

async function consultAI(message, bannedWords, timeout = 300000) {
  const startTime = Date.now();

  try {
    const systemPrompt = `You are an expert at detecting filter bypass attempts in donation messages.


IMPORTANT: This is ONLY the first stage of filtering. Offensive, racist, or disgusting content will be filtered out later in the process. Your job is ONLY to detect matches to the banned words list. IGNORE ALL OTHER CONTENT - no matter how offensive, racist, or disgusting it is. Return it unfiltered if it doesn't match the banned words. Messages returned after this will be passed into another AI filter to remove offensive language. It is therefore okay for you to completely ignore offensive language as you know it is dealt with at a later stage.

TASK: Check if the message contains or sounds like any banned word/name/symbol from the list.


MATCHING TYPES:

1. EXACT MATCHES: Direct character/symbol matches (e.g., "卐" symbol)
2. PHONETIC MATCHES: Sound-alike words
- "Lun Dun" = "London" → MATCH
- "Loo Iss" = "Lewis" → MATCH
  

CONTEXT IS CRITICAL - UNDERSTAND WHAT THE BANNED WORD REPRESENTS:
- If a banned word is an ADDRESS (e.g., "12 Orchard Street", "Baldy Cottage"), only match it when used AS an address
→ "12 Orchard Street" = MATCH (full address)
→ "orchard" or "orchards" alone = NO MATCH (just a common word about fruit trees)
→ "My cottage has a fireplace" = NO MATCH (talking about houses in general, not "Baldy Cottage")
→ "He lives at Baldy Cottage" = MATCH (using it as an address)

- If a banned word is a PLACE NAME (e.g., "Bembridge", "Leeds"), consider the context:
→ "I visited Bembridge" = MATCH (mentioning the specific town)
→ "Bembridge is nice" = MATCH (discussing the specific place)
→ BUT: "Bembridge" in "Bhem Baridge" is probably a bypass attempt = YOU MUST use judgment


- If a banned word is a FULL NAME (e.g., "Matthew Adams"), only match the complete name:
→ "Matthew Adams" = MATCH
→ "Math Yew Adams" = MATCH (phonetic bypass)
→ "Matthew" alone = NO MATCH (generic first name, unless it's "Matt"/"Matthew" which is always allowed alone)
  

ESCALATED SCRUTINY RULE:
- If you find ONE banned word match, become MORE suspicious of ALL other words in the message
- Check for additional personal information (full names, addresses, phone numbers, etc.)
- Example: "Bembur Ridge? His real name is Alan Adams" with banned ["Bembridge"]
→ "Bembur Ridge" = MATCH (phonetic bypass of "Bembridge")
→ Because doxing detected, "Alan Adams" = MATCH (full name in doxing context - even though that name is not banned)


SPECIAL EXCEPTION - "Matt" NAME RULE:
- "Matt" or "Matthew" appearing ALONE is allowed (it's a common public name)
- BUT if "Matt" or "Matthew" appears with identifying info, flag it:
→ "Matt Adams" = MATCH (surname makes it specific)
→ "Matt from Bembridge" = MATCH (location makes it specific)
→ "Matt" alone = NO MATCH


CONDITIONALLY WHITELISTED TERMS:
- "LWS" alone = NO MATCH (this is a nickname of a regular donator, not a dox attempt for "Lewis")
- BUT "LWS" with doxing context = MATCH (e.g., "LWS's real name is...", "LWS is actually called...", "LWS lives at...")

Be smart about context. DO NOT flag innocent uses of common words just because they appear in a banned address.`;

    const userPrompt = `Message: "${message}"
Banned: ${bannedWords.join(', ')}

Return JSON with the ACTUAL TEXT from the message that should be replaced (can be multiple):
{"contains_banned": true/false, "matched_words": ["text1", "text2"], "confidence": 0-100, "reasoning": "why"}

Examples:
- Message: "Bembur Ridge" + Banned: "Bembridge" → {"contains_banned": true, "matched_words": ["Bembur Ridge"], ...}
- Message: "Math Yew lives at Bembur Ridge" + Banned: "Matthew, Bembur Ridge" → {"contains_banned": true, "matched_words": ["Math Yew", "Bembur Ridge"], ...}
- Message: "Support 卐 movement" + Banned: "卐" → {"contains_banned": true, "matched_words": ["卐"], ...}`;

    console.log('Checking:', message, 'vs', bannedWords.join(', '));

    // Call local AI server
    console.log(`Calling local AI server with model: ${AI_MODEL}`);
    const completion = await Promise.race([
      fetch(`${AI_SERVER_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 10000
        })
      }).then(res => res.json()),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI timeout')), timeout)
      )
    ]);

    const responseTime = Date.now() - startTime;
    stats.totalResponseTime += responseTime;

    // Check if content is empty
    const aiResponse = completion.choices[0].message.content;
    console.log('Response length:', aiResponse ? aiResponse.length : 0);

    if (!aiResponse || aiResponse.trim() === '') {
      throw new Error(`No content in response. Finish reason: ${completion.choices[0].finish_reason}. Used ${completion.usage.completion_tokens_details.reasoning_tokens} reasoning tokens.`);
    }

    // Parse AI response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in AI response');
    }

    const aiResult = JSON.parse(jsonMatch[0]);
    stats.aiSuccesses++;

    console.log(`Decision in ${responseTime}ms: ${aiResult.contains_banned ? 'MATCH' : 'NO MATCH'}`);

    return {
      success: true,
      containsBanned: aiResult.contains_banned,
      matchedWords: aiResult.matched_words || [],
      confidence: aiResult.confidence || 0,
      reasoning: aiResult.reasoning || ''
    };

  } catch (error) {
    const responseTime = Date.now() - startTime;
    stats.aiFailures++;
    console.error(`Failed after ${responseTime}ms:`, error.message);
    console.error(`Full error:`, error);
    if (error.response) {
      console.error(`Error response:`, error.response.data);
    }

    // On AI failure, trust the phonetic algorithms
    return {
      success: false,
      containsBanned: false,
      matchedWords: [],
      confidence: 0,
      reasoning: 'AI consult failed, relying on phonetic match'
    };
  }
}

function fallbackRegexFilter(message, bannedWords) {
  console.log('Using fallback regex filter');
  stats.fallbackActivations++;

  let containsBanned = false;
  const matchedWords = [];

  bannedWords.forEach(word => {
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const normalRegex = new RegExp(`\\b${escapedWord}\\b`, 'gi');

    if (normalRegex.test(message)) {
      containsBanned = true;
      if (!matchedWords.includes(word)) {
        matchedWords.push(word);
      }
    }

    // Match with optional spaces
    const chars = escapedWord.split('');
    const spacedPattern = chars.join('\\s*');
    const spacedRegex = new RegExp(spacedPattern, 'gi');

    if (spacedRegex.test(message)) {
      containsBanned = true;
      if (!matchedWords.includes(word)) {
        matchedWords.push(word);
      }
    }
  });

  return {
    containsBanned,
    matchedWords,
    confidence: containsBanned ? 60 : 0,
    reasoning: 'Fallback regex detection'
  };
}

async function filterMessage(message, bannedWords, cacheEnabled = true, aiEnabled = true) {
  const startTime = Date.now();
  stats.totalRequests++;

  if (!bannedWords || bannedWords.length === 0 || !message) {
    return {
      filtered: message,
      wasFiltered: false,
      usedCache: false,
      usedAI: false,
      responseTime: Date.now() - startTime
    };
  }

  // Check cache first
  let cacheKey = null;
  if (cacheEnabled) {
    cacheKey = getCacheKey(message, bannedWords);
    const cached = cache.get(cacheKey);
    if (cached) {
      stats.cacheHits++;
      console.log('Cache hit');
      return {
        ...cached,
        usedCache: true,
        responseTime: Date.now() - startTime
      };
    }
    stats.cacheMisses++;
  }

  // Use AI directly for all filtering
  let filterResult;
  try {
    if (aiEnabled) {
      // Direct AI consultation - no phonetic pre-filtering
      console.log(`Checking message: "${message}"`);
      const aiResult = await consultAI(message, bannedWords);

      if (aiResult.success) {
        filterResult = {
          containsBanned: aiResult.containsBanned,
          matchedWords: aiResult.matchedWords,
          confidence: aiResult.confidence,
          reasoning: aiResult.reasoning
        };
      } else {
        // AI failed, use fallback
        filterResult = fallbackRegexFilter(message, bannedWords);
      }
    } else {
      // AI disabled, use fallback regex
      filterResult = fallbackRegexFilter(message, bannedWords);
    }
  } catch (error) {
    console.error('Error:', error);
    filterResult = fallbackRegexFilter(message, bannedWords);
  }

  // Apply filtering if needed
  let filtered = message;
  let wasFiltered = false;

  if (filterResult.containsBanned && filterResult.matchedWords.length > 0) {
    wasFiltered = true;

    // Replace the matched phonetic text with "CALLUM IS KING"
    filterResult.matchedWords.forEach(matchedText => {
      // Case-insensitive replacement
      const regex = new RegExp(matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      filtered = filtered.replace(regex, 'CALLUM IS KING');
    });

    console.log(`Filtered message. Matched: ${filterResult.matchedWords.join(', ')}, Confidence: ${filterResult.confidence}%`);
  }

  const result = {
    filtered,
    wasFiltered,
    matchedWords: filterResult.matchedWords,
    confidence: filterResult.confidence,
    reasoning: filterResult.reasoning,
    usedCache: false,
    usedAI: aiEnabled,
    responseTime: Date.now() - startTime
  };

  // Store in cache
  if (cacheEnabled && cacheKey) {
    cache.set(cacheKey, result);
  }

  return result;
}

function getStats() {
  const avgResponseTime = stats.totalRequests > 0
    ? Math.round(stats.totalResponseTime / stats.totalRequests)
    : 0;

  const cacheHitRate = stats.totalRequests > 0
    ? Math.round((stats.cacheHits / stats.totalRequests) * 100)
    : 0;

  return {
    ...stats,
    avgResponseTime,
    cacheHitRate
  };
}

function resetStats() {
  stats.totalRequests = 0;
  stats.cacheHits = 0;
  stats.cacheMisses = 0;
  stats.phoneticMatches = 0;
  stats.aiConsults = 0;
  stats.aiSuccesses = 0;
  stats.aiFailures = 0;
  stats.fallbackActivations = 0;
  stats.totalResponseTime = 0;
}

function clearCache() {
  cache.flushAll();
  console.log('Cache cleared');
}

async function testConnection() {
  try {
    const response = await fetch(`${AI_SERVER_URL}/v1/models`);
    const data = await response.json();
    const hasModel = data.data?.some(m => m.id.includes('llama'));
    return {
      connected: true,
      modelAvailable: hasModel,
      models: data.data?.map(m => m.id) || []
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  }
}

async function filterMessagesBatch(messages, bannedWords, cacheEnabled = true, aiEnabled = true) {
  stats.totalRequests++;
  const startTime = Date.now();

  // If no messages or AI disabled, return originals
  if (!messages || messages.length === 0 || !aiEnabled) {
    return messages.map(msg => ({
      filtered: msg,
      wasFiltered: false,
      matchedWords: [],
      confidence: 0,
      reasoning: aiEnabled ? 'No messages to filter' : 'AI disabled'
    }));
  }

  // Combine all messages into a single prompt with labels
  const combinedMessage = messages.map((msg, i) => `[TEXT${i}]: ${msg}`).join('\n');

  // Check cache for the combined message
  const cacheKey = crypto.createHash('sha256')
    .update(`${combinedMessage}:${bannedWords.join(',')}`)
    .digest('hex');

  if (cacheEnabled) {
    const cached = cache.get(cacheKey);
    if (cached) {
      stats.cacheHits++;
      console.log('Cache hit');
      return cached.map(result => ({
        ...result,
        usedCache: true,
        responseTime: Date.now() - startTime
      }));
    }
    stats.cacheMisses++;
  }

  // Use AI for batch filtering
  let results;
  try {
    if (aiEnabled) {
      console.log(`Checking ${messages.length} texts`);

      const systemPrompt = `You are an expert at detecting filter bypass attempts in donation messages.


IMPORTANT: This is ONLY the first stage of filtering. Offensive, racist, or disgusting content will be filtered out later in the process. Your job is ONLY to detect matches to the banned words list. IGNORE ALL OTHER CONTENT - no matter how offensive, racist, or disgusting it is. Return it unfiltered if it doesn't match the banned words. Messages returned after this will be passed into another AI filter to remove offensive language. It is therefore okay for you to completely ignore offensive language as you know it is dealt with at a later stage.

TASK: Check if the message contains or sounds like any banned word/name/symbol from the list.


MATCHING TYPES:

1. EXACT MATCHES: Direct character/symbol matches (e.g., "卐" symbol)
2. PHONETIC MATCHES: Sound-alike words
- "Lun Dun" = "London" → MATCH
- "Loo Iss" = "Lewis" → MATCH
  

CONTEXT IS CRITICAL - UNDERSTAND WHAT THE BANNED WORD REPRESENTS:
- If a banned word is an ADDRESS (e.g., "12 Orchard Street", "Baldy Cottage"), only match it when used AS an address
→ "12 Orchard Street" = MATCH (full address)
→ "orchard" or "orchards" alone = NO MATCH (just a common word about fruit trees)
→ "My cottage has a fireplace" = NO MATCH (talking about houses in general, not "Baldy Cottage")
→ "He lives at Baldy Cottage" = MATCH (using it as an address)

- If a banned word is a PLACE NAME (e.g., "Bembridge", "Leeds"), consider the context:
→ "I visited Bembridge" = MATCH (mentioning the specific town)
→ "Bembridge is nice" = MATCH (discussing the specific place)
→ BUT: "Bembridge" in "Bhem Baridge" is probably a bypass attempt = YOU MUST use judgment


- If a banned word is a FULL NAME (e.g., "Matthew Adams"), only match the complete name:
→ "Matthew Adams" = MATCH
→ "Math Yew Adams" = MATCH (phonetic bypass)
→ "Matthew" alone = NO MATCH (generic first name, unless it's "Matt"/"Matthew" which is always allowed alone)
  

ESCALATED SCRUTINY RULE:
- If you find ONE banned word match, become MORE suspicious of ALL other words in the message
- Check for additional personal information (full names, addresses, phone numbers, etc.)
- Example: "Bembur Ridge? His real name is Alan Adams" with banned ["Bembridge"]
→ "Bembur Ridge" = MATCH (phonetic bypass of "Bembridge")
→ Because doxing detected, "Alan Adams" = MATCH (full name in doxing context - even though that name is not banned)


SPECIAL EXCEPTION - "Matt" NAME RULE:
- "Matt" or "Matthew" appearing ALONE is allowed (it's a common public name)
- BUT if "Matt" or "Matthew" appears with identifying info, flag it:
→ "Matt Adams" = MATCH (surname makes it specific)
→ "Matt from Bembridge" = MATCH (location makes it specific)
→ "Matt" alone = NO MATCH


CONDITIONALLY WHITELISTED TERMS:
- "LWS" alone = NO MATCH (this is a nickname of a regular donator, not a dox attempt for "Lewis")
- BUT "LWS" with doxing context = MATCH (e.g., "LWS's real name is...", "LWS is actually called...", "LWS lives at...")

Be smart about context. DO NOT flag innocent uses of common words just because they appear in a banned address.`;

      const userPrompt = `Texts to check (each labeled):
${combinedMessage}

Banned words: ${bannedWords.join(', ')}

Return JSON array with results for EACH text in order:
[
  {"text_id": "TEXT0", "contains_banned": true/false, "matched_words": ["word1"], "confidence": 0-100, "reasoning": "why"},
  {"text_id": "TEXT1", "contains_banned": true/false, "matched_words": [], "confidence": 0-100, "reasoning": "why"}
]

Return the ACTUAL TEXT from each message that should be replaced, not the banned word names.`;

      const completion = await Promise.race([
        fetch(`${AI_SERVER_URL}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: AI_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_tokens: 10000
          })
        }).then(res => res.json()),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI timeout')), 300000)
        )
      ]);

      const aiResponse = completion.choices[0].message.content;
      if (!aiResponse || aiResponse.trim() === '') {
        throw new Error('No content in AI response');
      }

      // Parse JSON array
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array in AI response');
      }

      const aiResults = JSON.parse(jsonMatch[0]);
      stats.aiSuccesses++;

      // Process results for each message
      results = messages.map((msg, i) => {
        const aiResult = aiResults[i] || { contains_banned: false, matched_words: [], confidence: 0 };

        let filtered = msg;
        let wasFiltered = false;

        if (aiResult.contains_banned && aiResult.matched_words && aiResult.matched_words.length > 0) {
          wasFiltered = true;
          aiResult.matched_words.forEach(matchedText => {
            const escapedText = matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // replace spaces with flexible whitespace pattern to catch variations
            const flexiblePattern = escapedText.replace(/\s+/g, '\\s+');
            const regex = new RegExp(flexiblePattern, 'gi');
            filtered = filtered.replace(regex, 'CALLUM IS KING');
          });
        }

        return {
          filtered,
          wasFiltered,
          matchedWords: aiResult.matched_words || [],
          confidence: aiResult.confidence || 0,
          reasoning: aiResult.reasoning || '',
          usedAI: true,
          responseTime: Date.now() - startTime
        };
      });

    } else {
      // AI disabled - use fallback for each
      results = messages.map(msg => {
        const fallback = fallbackRegexFilter(msg, bannedWords);
        let filtered = msg;
        if (fallback.containsBanned && fallback.matchedWords.length > 0) {
          fallback.matchedWords.forEach(word => {
            const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            filtered = filtered.replace(regex, 'CALLUM IS KING');
          });
        }
        return {
          filtered,
          wasFiltered: fallback.containsBanned,
          matchedWords: fallback.matchedWords,
          confidence: fallback.confidence,
          reasoning: fallback.reasoning,
          usedAI: false
        };
      });
    }
  } catch (error) {
    console.error('Error:', error);
    stats.aiFailures++;
    // Fallback for all messages
    results = messages.map(msg => ({
      filtered: msg,
      wasFiltered: false,
      matchedWords: [],
      confidence: 0,
      reasoning: 'AI batch filter failed',
      usedAI: false
    }));
  }

  // Cache the results
  if (cacheEnabled) {
    cache.set(cacheKey, results);
  }

  return results;
}

module.exports = {
  filterMessage,
  filterMessagesBatch,
  getStats,
  resetStats,
  clearCache,
  testConnection
};
