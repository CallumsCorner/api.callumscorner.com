const { requireAuth } = require('../../../lib/auth');
const db = require('../../../lib/database');
const cors = require('../../../lib/cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');

module.exports.config = {
  api: {
    bodyParser: false,
  },
};

// Create soundboard directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'public', 'soundboard');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueFilename = `${uuidv4()}${ext}`;
    cb(null, uniqueFilename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow audio files
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed!'), false);
    }
  }
});

// Promisify multer
const uploadMiddleware = upload.single('soundFile');

function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Run multer middleware
    await runMiddleware(req, res, uploadMiddleware);

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { name } = req.body;

    if (!name || !name.trim()) {
      // Delete uploaded file if name is missing
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Sound name is required' });
    }

    // Save to database
    const result = await db.addSoundboardSound(
      name.trim(),
      req.file.filename,
      req.file.originalname,
      req.file.size
    );

    res.status(200).json({
      success: true,
      message: 'Sound uploaded successfully',
      sound: {
        id: result.insertId,
        name: name.trim(),
        filename: req.file.filename,
        original_name: req.file.originalname,
        file_size: req.file.size
      }
    });

  } catch (error) {
    console.error('Soundboard upload error:', error);

    // Clean up uploaded file if database save failed
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Failed to upload sound',
      details: error.message
    });
  }
}

module.exports = cors(requireAuth(handler));
