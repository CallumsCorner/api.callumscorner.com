// Helper to determine if the request's Referer origin is allowed to see the message field.
function isAllowedReferrer(req) {
  try {
    const header = (req.headers && (req.headers['referer'] || req.headers['referrer'])) || '';
    if (!header || typeof header !== 'string') return false;

    const origin = new URL(header).origin.toLowerCase();

    // Only allow these exact origins (scheme + host [+ port])
    const allowedOrigins = new Set([
      'https://SECRETOVERLAYSUBDOMAIN.overlay.callumscorner.com',
      'https://SECRETADMINSUBDOMAIN.admin.callumscorner.com',
    ]);

    return allowedOrigins.has(origin);
  } catch {
    // Malformed or missing Referer -> not allowed
    return false;
  }
}

module.exports = { isAllowedReferrer };