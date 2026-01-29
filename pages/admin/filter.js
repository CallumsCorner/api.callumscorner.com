const { requireAdmin, adminOnly } = require('../../lib/auth');
const db = require('../../lib/database');
const cors = require('../../lib/cors');

async function handler(req, res) {
  if (req.method === 'GET') {
    const filterEnabled = await db.getSetting('filterEnabled');
    const filterReplacement = await db.getSetting('filterReplacement');
    const filterStrictness = await db.getSetting('filterStrictness');
    const aiFilterEnabled = await db.getSetting('aiFilterEnabled');
    const aiFilterCache = await db.getSetting('aiFilterCache');
    const words = await db.query('SELECT * FROM WordFilter');
    return res.status(200).json({
      enabled: filterEnabled === 'true',
      replacement: filterReplacement || 'CALLUM IS KING',
      strictness: parseInt(filterStrictness) || 50,
      aiEnabled: aiFilterEnabled === 'true',
      cacheEnabled: aiFilterCache === 'true',
      words,
    });
  }

  if (req.method === 'POST') {
    const { enabled, replacement, words, strictness, aiEnabled, cacheEnabled } = req.body;

    await db.setSetting('filterEnabled', enabled.toString());
    await db.setSetting('filterReplacement', replacement);
    await db.setSetting('filterStrictness', strictness !== undefined ? strictness.toString() : '50');
    await db.setSetting('aiFilterEnabled', aiEnabled !== undefined ? aiEnabled.toString() : 'true');
    await db.setSetting('aiFilterCache', cacheEnabled !== undefined ? cacheEnabled.toString() : 'true');

    // Clear existing words and insert new ones
    await db.query('DELETE FROM WordFilter');
    if (words && words.length > 0) {
      // Filter out any empty words before trying to insert
      const validWords = words.filter(w => w.word && w.word.trim() !== '');
      if (validWords.length > 0) {
        const insertValues = validWords.map(w => [w.word.trim(), w.replacement || null]);
        
        // Manually construct placeholders
        const placeholders = insertValues.map(() => '(?, ?)').join(', ');
        const flatValues = insertValues.flat(); // Flatten the array for the driver
        
        if (flatValues.length > 0) {
            const sql = `INSERT INTO WordFilter (word, replacement) VALUES ${placeholders}`;
            await db.query(sql, flatValues);
        }
      }
    }

    return res.status(200).json({ success: true, message: 'Filter settings updated.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

module.exports = cors(adminOnly(requireAdmin(handler)));