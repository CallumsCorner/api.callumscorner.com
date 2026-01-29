const db = require('./database');
const crypto = require('crypto');

// create a new api key
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

// capture the api key from the requets
function getApiKeyFromRequest(req) {
  // check auth header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // x-api-key header
  if (req.headers['x-api-key']) {
    return req.headers['x-api-key'];
  }

  // query parameter
  if (req.query && req.query.api_key) {
    return req.query.api_key;
  }

  return null;
}

// validate the api and check perms
async function validateApiKey(req, requiredPermission = null) {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) {
    return null;
  }

  const keyData = await db.getApiKeyByKey(apiKey);
  if (!keyData || !keyData.is_active) {
    return null;
  }

  // parse perms
  let permissions = keyData.permissions;
  if (typeof permissions === 'string') {
    try {
      permissions = JSON.parse(permissions);
    } catch (e) {
      permissions = [];
    }
  }

  // check if required permission is granted
  if (requiredPermission && !permissions.includes(requiredPermission) && !permissions.includes('*')) {
    return null;
  }

  // Update last used timestamp
  db.updateApiKeyLastUsed(keyData.id).catch(() => {});

  return {
    ...keyData,
    permissions
  };
}

// middleware for a generic valid api key requirement
function requireApiKey(requiredPermission = null) {
  return (handler) => async (req, res) => {
    const apiKeyData = await validateApiKey(req, requiredPermission);

    if (!apiKeyData) {
      return res.status(401).json({ error: 'Invalid or missing API key' });
    }

    req.apiKey = apiKeyData;
    return handler(req, res);
  };
}

// Middleware that optionally validates API key (doesn't require it) - can be used to return extra information 
// on an authenticated request to a public endpoint
// (ayup.cc can fetch /donations/queue with his API key to get full data, such as donation messages)
async function optionalApiKey(req, requiredPermission = null) {
  return await validateApiKey(req, requiredPermission);
}

module.exports = {
  generateApiKey,
  getApiKeyFromRequest,
  validateApiKey,
  requireApiKey,
  optionalApiKey
};
