const bcrypt = require('bcryptjs');
const db = require('../../lib/database'); 
const { createSession, setSessionCookie, adminOnly } = require('../../lib/auth'); 
const cors = require('../../lib/cors'); 


async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Get user from database
    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    console.log(`User '${user.username}' logged in successfully.`);

    // Update last login
    await db.updateLastLogin(user.id);

    // Create session
    const sessionToken = await createSession(user.id);
    setSessionCookie(res, sessionToken);

    // Return user data (without password)
    const userResponse = {
      id: user.id,
      username: user.username,
      role: user.role,
      last_login: user.last_login,
      created_at: user.created_at,
    };

    res.status(200).json({
      success: true,
      user: userResponse,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = adminOnly(cors(handler));
