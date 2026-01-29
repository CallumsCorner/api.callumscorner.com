// rateLimiter.js
class RateLimiter {
  constructor() {
    this.requests = new Map(); // IP -> { count, resetTime }
  }

  // Get real IP address from request headers (considering Cloudflare/Nginx proxy)
  getClientIP(req) {
    // Cloudflare sets CF-Connecting-IP header with real client IP
    let clientIP = req.headers['cf-connecting-ip'] ||
                   req.headers['x-forwarded-for'] ||
                   req.headers['x-real-ip'] ||
                   req.connection.remoteAddress ||
                   req.socket.remoteAddress ||
                   (req.connection.socket ? req.connection.socket.remoteAddress : null);

    // If x-forwarded-for contains multiple IPs, take the first (original client)
    if (clientIP && clientIP.includes(',')) {
      clientIP = clientIP.split(',')[0].trim();
    }

    return clientIP;
  }

  // Check if request should be rate limited
  isRateLimited(req, options = {}) {
    const {
      windowMs = 60000, // 1 minute default
      maxRequests = 10,  // 10 requests per minute default
      skipSuccessful = false // whether to skip counting successful requests
    } = options;

    // Skip rate limiting for admin and overlay pages (hidden URLs)
    const referer = req.headers.referer;
    const adminUrl = 'https://SECRETADMINSUBDOMAIN.admin.callumscorner.com/';
    const overlayUrl = 'https://SECRETOVERLAYSUBDOMAIN.overlay.callumscorner.com/';

    if (referer && (referer.startsWith(adminUrl) || referer.startsWith(overlayUrl))) {
      console.log(`[RateLimit] Skipping rate limit for privileged referer: ${referer}`);
      return { isLimited: false, clientIP: 'privileged', skipReason: 'admin/overlay' };
    }

    const clientIP = this.getClientIP(req);
    if (!clientIP) {
      console.warn('[RateLimit] Could not determine client IP, allowing request');
      return { isLimited: false, clientIP: 'unknown' };
    }

    const now = Date.now();
    const key = clientIP;

    // Get or initialize request tracking for this IP
    let ipData = this.requests.get(key);

    // Reset if window has expired
    if (!ipData || now > ipData.resetTime) {
      ipData = {
        count: 0,
        resetTime: now + windowMs,
        firstRequest: now
      };
    }

    // Check if limit exceeded
    if (ipData.count >= maxRequests) {
      console.log(`[RateLimit] IP ${clientIP} rate limited (${ipData.count}/${maxRequests} requests in window)`);
      return {
        isLimited: true,
        clientIP,
        count: ipData.count,
        maxRequests,
        resetTime: ipData.resetTime,
        retryAfter: Math.ceil((ipData.resetTime - now) / 1000)
      };
    }

    // Increment counter and update
    ipData.count++;
    this.requests.set(key, ipData);

    return {
      isLimited: false,
      clientIP,
      count: ipData.count,
      maxRequests,
      resetTime: ipData.resetTime
    };
  }

  // Record successful request (for endpoints that want to skip counting successes)
  recordSuccess(req) {
    // This method can be used to decrement counter for successful requests if needed
    // For now, we'll count all requests regardless of success
  }

  // Clean up old entries (run periodically)
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, data] of this.requests.entries()) {
      if (now > data.resetTime) {
        this.requests.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[RateLimit] Cleaned up ${cleanedCount} expired rate limit entries`);
    }
  }

  // Get current stats for monitoring
  getStats() {
    return {
      totalTrackedIPs: this.requests.size,
      entries: Array.from(this.requests.entries()).map(([ip, data]) => ({
        ip,
        count: data.count,
        resetTime: data.resetTime,
        timeUntilReset: Math.max(0, data.resetTime - Date.now())
      }))
    };
  }
}

// Create singleton instance
const rateLimiter = new RateLimiter();

// Clean up every 5 minutes
setInterval(() => {
  rateLimiter.cleanup();
}, 5 * 60 * 1000);

module.exports = rateLimiter;