const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const db = require('./lib/database');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Make wss available globally for monitoring
global.wss = wss;

const port = process.env.PORT || 3000;

// Allowed origins for CORS and WebSocket
const allowedOrigins = [
  'https://api.callumscorner.com',
  'https://donate.callumscorner.com',
  'https://refund.callumscorner.com',
  'https://rewind.callumscorner.com',
  'https://SECRETADMINSUBDOMAIN.admin.callumscorner.com',
  'https://SECRETOVERLAYSUBDOMAIN.overlay.callumscorner.com',
  'https://callumscorner.com'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (no origin header)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log(`Blocked: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Cache-Control', 'X-Requested-With']
}));

app.use(cookieParser(process.env.SESSION_SECRET));

// Stripe webhook needs raw body for signature verification - must be before express.json()
const stripeWebhook = require('./pages/stripe/webhook');
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve soundboard files (public, no credentials needed)
app.use('/soundboard', cors(), express.static(path.join(__dirname, 'public', 'soundboard')));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// FINALLY WORKING Dynamic Route Loader
// taken from the internet
// sorry cannot find the source to credit
const pagesDir = path.join(__dirname, 'pages');

const loadRoutes = (dir, prefix = '') => {
  const files = fs.readdirSync(dir).sort((a, b) => {
    if (a.includes('[') && !b.includes('[')) return 1;
    if (!a.includes('[') && b.includes('[')) return -1;
    return a.localeCompare(b);
  });
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      loadRoutes(fullPath, `${prefix}/${file}`);
    } else if (file.endsWith('.js')) {
      let routePath = `${prefix}/${file.replace(/\.js$/, '')}`
        .replace(/index$/, '')
        .replace(/\[([^\]]+)\]/g, ':$1');

      if (routePath.endsWith('/') && routePath.length > 1) {
        routePath = routePath.slice(0, -1);
      }

      // Skip routes that are manually registered (need raw body parsing)
      if (routePath === '/stripe/webhook') continue;

      try {
        const route = require(fullPath);
        // Use the default export if it exists, otherwise use the module itself
        const handler = route.default || route;

        if (typeof handler === 'function') {
          // Use app.all() to handle any HTTP method (GET, POST, etc.)
          app.all(routePath, handler);
          console.log(`Successfully loaded route: ${routePath}`);
        } else {
          console.warn(`Could not load route ${fullPath}: handler is not a function.`);
        }
      } catch (error) {
        console.error(`Error loading route ${fullPath}:`, error.message);
      }
    }
  }
};

// Load all API routes from the 'pages' directory
loadRoutes(pagesDir);

// cleanup
const cleanupInterval = 24 * 60 * 60 * 1000; // 24 hours

const runCleanup = () => {
  console.log('Running daily data cleanup task...');
  db.cleanupOldData();

  // Also clean up old TTS files
  const ttsDir = path.join(__dirname, 'public', 'uploads', 'tts');
  if (fs.existsSync(ttsDir)) {
    fs.readdir(ttsDir, (err, files) => {
      if (err) {
        console.error('Error reading TTS directory for cleanup:', err);
        return;
      }

      const now = Date.now();
      let cleanedCount = 0;
      files.forEach(file => {
        if (file.startsWith('tts_') && file.endsWith('.mp3')) {
          const filePath = path.join(ttsDir, file);
          const stats = fs.statSync(filePath);
          // Clean files older than 3 days as well
          if (now - stats.mtime.getTime() > 3 * 24 * 60 * 60 * 1000) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        }
      });
        console.log(`Cleaned up ${cleanedCount} old TTS files.`);
    });
  }
};

// Run cleanup on startup and then every 24 hours
runCleanup();
setInterval(runCleanup, cleanupInterval);

// Final 404 handler
app.use((req, res) => {
  res.status(404).send("Cannot " + req.method + " " + req.url);
});

// WebSocket server logic
const wsAllowedOrigins = [
  'https://SECRETADMINSUBDOMAIN.admin.callumscorner.com',
  'https://SECRETOVERLAYSUBDOMAIN.overlay.callumscorner.com'
];

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;

  if (!origin || !wsAllowedOrigins.includes(origin)) {
    console.log(`Denied connection from origin: ${origin || 'unknown'}`);
    ws.terminate();
    return;
  }

  // Check if this is an overlay connection
  const isOverlayConnection = origin && origin.includes('SECRETOVERLAYSUBDOMAIN');

  if (isOverlayConnection) {
    // Check if there's already an active overlay connection
    let existingOverlay = false;
    wss.clients.forEach((client) => {
      if (client.isOverlay && client.readyState === WebSocket.OPEN) {
        existingOverlay = true;
      }
    });

    if (existingOverlay) {
      console.log(`Overlay already connected, rejecting new connection from: ${origin}`);
      ws.send(JSON.stringify({
        type: 'error',
        code: 'OVERLAY_ALREADY_CONNECTED',
        message: 'The overlay is already open in another window or browser.'
      }));
      ws.close(4000, 'Overlay already connected');
      return;
    }

    ws.isOverlay = true;
    console.log(`Overlay connected from: ${origin}`);
  } else {
    console.log(`Allowed connection from origin: ${origin}`);
  }

  ws.isAlive = true;
  ws.connectedAt = new Date().toISOString();
  ws.clientOrigin = origin;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }
    } catch (e) {
      // Not JSON
    }
  });

  ws.on('close', () => {
    // Connection closed
  });
});

// Heartbeat to keep connections alive and prune dead ones
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

global.broadcastToClients = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

server.listen(port, async (err) => {
  if (err) throw err;
  console.log(`> API server ready on http://localhost:${port}`);
});