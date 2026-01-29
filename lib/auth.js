const db = require('./database');
const { v4: uuidv4 } = require('uuid');

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: '/',
  domain: process.env.NODE_ENV === 'production' ? '.callumscorner.com' : undefined,
};

async function createSession(userId) {
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  
  await db.createSession(userId, token, expiresAt);
  return token;
}

async function getSessionUser(req) {
  const token = req.cookies?.session;
  if (!token) return null;

  const session = await db.getSessionByToken(token);
  return session || null;
}

function setSessionCookie(res, token) {
  const cookieParts = [`session=${token}`];

  Object.entries(COOKIE_OPTIONS).forEach(([key, value]) => {
    if (value === undefined) return; // Skip undefined values
    if (typeof value === 'boolean' && value) {
      cookieParts.push(key);
    } else if (typeof value !== 'boolean') {
      cookieParts.push(`${key}=${value}`);
    }
  });

  const cookieString = cookieParts.join('; ');
  res.setHeader('Set-Cookie', cookieString);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; httpOnly');
}

function requireAuth(handler, requiredRole = null) {
  return async (req, res) => {
    try {
      const user = await getSessionUser(req);
      
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      if (requiredRole && user.role !== requiredRole && user.role !== 'admin') {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      
      req.user = user;
      return handler(req, res);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
    }
  };
}

function requireAdmin(handler) {
  return requireAuth(handler, 'admin');
}

function overlayOnly(handler) {
  return async (req, res) => {
    try {
      const referer = req.headers.referer;
      const allowedReferer = 'https://SECRETOVERLAYSUBDOMAIN.overlay.callumscorner.com/';
      //const devReferer = 'http://localhost:3004/'; // For local development

      if (referer && (referer.startsWith(allowedReferer) || referer.startsWith(devReferer))) {
        return handler(req, res);
      }
      
      return res.status(403).json({ error: 'Forbidden: Access denied. You are not requesting this endpoint from the correct origin. Good job finding this endpoint though!' });

    } catch (error) {
      console.error('Overlay auth middleware error:', error);
      return res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
    }
  };
}

function adminOnly(handler) {
  return async (req, res) => {
    try {
      const referer = req.headers.referer;
      const allowedReferer = 'https://SECRETADMINSUBDOMAIN.admin.callumscorner.com/';
      //const devReferer = 'http://localhost:3004/'; // For local development

      if (referer && (referer.startsWith(allowedReferer) || referer.startsWith(devReferer))) {
        return handler(req, res);
      }
      
      return res.status(403).json({ error: 'Forbidden: Access denied. You are not requesting this endpoint from the correct origin. Good job finding this endpoint though!' });

    } catch (error) {
      console.error('Overlay auth middleware error:', error);
      return res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
    }
  };
}

function hiddenOnly(handler) {
  return async (req, res) => {
    try {
      const referer = req.headers.referer;
      const admin = 'https://SECRETADMINSUBDOMAIN.admin.callumscorner.com/';
      const overlay = 'https://SECRETOVERLAYSUBDOMAIN.overlay.callumscorner.com/';
      //const devReferer = 'http://localhost:3004/'; // For local development

      if (referer && (referer.startsWith(admin) || referer.startsWith(overlay))) {
        return handler(req, res);
      }
      
      return res.status(403).json({ error: 'Forbidden: Access denied. You are not requesting this endpoint from the correct origin. Good job finding this endpoint though!' });

    } catch (error) {
      console.error('Overlay auth middleware error:', error);
      return res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
    }
  };
}

module.exports = {
  createSession,
  getSessionUser,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireAdmin,
  overlayOnly,
  adminOnly,
  hiddenOnly,
};
