const db = require('../../lib/database');
const cors = require('../../lib/cors');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const leaderboard = await db.getLeaderboard('7 DAY');
    res.status(200).json(leaderboard);
  } catch (error) {
    console.error('Get 7-day leaderboard error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(handler);