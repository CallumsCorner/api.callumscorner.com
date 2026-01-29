const db = require('../../lib/database'); 
const { clearSessionCookie, getSessionUser, adminOnly } = require('../../lib/auth'); 
const cors = require('../../lib/cors'); 

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sessionToken = req.cookies?.session;

    const user = await getSessionUser(req);
    
    if (sessionToken) {
      // Delete session from database
      await db.deleteSession(sessionToken);
    }

    // Clear session cookie
    clearSessionCookie(res);

    console.log(`User '${user.username}' logged out successfully.`);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(adminOnly(handler));
