const { requireAdmin, adminOnly } = require('../../../lib/auth');
const aiFilter = require('../../../lib/ai-filter');
const cors = require('../../../lib/cors');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, bannedWords, aiEnabled, cacheEnabled } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!bannedWords || bannedWords.length === 0) {
    return res.status(400).json({ error: 'At least one banned word is required' });
  }

  try {
    const startTime = Date.now();

    // Call the AI filter with the provided settings
    const result = await aiFilter.filterMessage(
      message,
      bannedWords,
      cacheEnabled !== false, // Default true
      aiEnabled !== false      // Default true
    );

    const responseTime = Date.now() - startTime;

    // Return detailed result including AI response
    return res.status(200).json({
      ...result,
      responseTime,
      originalMessage: message
    });

  } catch (error) {
    console.error('[Filter Test] Error:', error);
    return res.status(500).json({
      error: 'Failed to test filter',
      message: error.message
    });
  }
}

module.exports = cors(adminOnly(requireAdmin(handler)));
