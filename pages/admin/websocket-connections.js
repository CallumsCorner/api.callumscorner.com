const { requireAdmin } = require('../../lib/auth');
const cors = require('../../lib/cors');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get WebSocket server from global
    if (!global.wss) {
      return res.status(200).json({
        totalConnections: 0,
        connections: [],
        timestamp: new Date().toISOString()
      });
    }

    const connections = [];
    let connectionId = 0;

    global.wss.clients.forEach((client) => {
      connectionId++;

      // Determine client type from origin
      const origin = client.clientOrigin || 'unknown';
      let clientType = 'Unknown';
      if (origin.includes('SECRETOVERLAYSUBDOMAIN')) clientType = 'Overlay';
      else if (origin.includes('SECRETADMINSUBDOMAIN')) clientType = 'Admin';

      // Extract IP address from request
      const req = client.upgradeReq;
      let ipAddress = 'unknown';
      if (req) {
        //  attempt get real IP from proxy headers first
        ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                    req.headers['x-real-ip'] ||
                    req.connection?.remoteAddress ||
                    req.socket?.remoteAddress ||
                    'unknown';

        // Clean up ipv6 localhost notation
        if (ipAddress === '::1' || ipAddress === '::ffff:127.0.0.1') {
          ipAddress = '127.0.0.1';
        }
        // Remove ipv6 prefix if there
        if (ipAddress.startsWith('::ffff:')) {
          ipAddress = ipAddress.substring(7);
        }
      }

      const connectionInfo = {
        id: connectionId,
        clientType: clientType,
        readyState: client.readyState === 1 ? 'OPEN' :
                    client.readyState === 0 ? 'CONNECTING' :
                    client.readyState === 2 ? 'CLOSING' : 'CLOSED',
        isAlive: client.isAlive !== false,
        origin: origin,
        ipAddress: ipAddress,
        connectedAt: client.connectedAt || null,
        userAgent: client.upgradeReq?.headers['user-agent'] || 'unknown',
        uptime: client.connectedAt ? Math.floor((Date.now() - new Date(client.connectedAt).getTime()) / 1000) : 0
      };

      connections.push(connectionInfo);
    });

    res.status(200).json({
      totalConnections: connections.length,
      connections: connections,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('WebSocket connections error:', error);
    res.status(500).json({ error: 'Failed to fetch WebSocket connections' });
  }
}

module.exports = cors(requireAdmin(handler));
