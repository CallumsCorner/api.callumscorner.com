const { requireAdmin } = require('../../../lib/auth'); 
const db = require('../../../lib/database'); 
const cors = require('../../../lib/cors'); 

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Get all users
      const users = await db.getAllUsers();
      res.status(200).json(users);
      
    } else if (req.method === 'POST') {
      // Create new user
      const { username, password, role } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      if (!['user', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      // Check if username already exists
      const existingUser = await db.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ error: 'Username already exists' });
      }

      // Create user
      await db.createUser(username, password, role);
      
      res.status(201).json({ success: true, message: 'User created successfully' });
      
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Users API error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAdmin(handler));
