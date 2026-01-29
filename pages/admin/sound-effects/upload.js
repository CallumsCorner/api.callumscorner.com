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

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'sounds');
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
    // Run the multer middleware
    await runMiddleware(req, res, uploadMiddleware);

    const { name } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Sound effect name is required' });
    }

    // Get file stats
    const filePath = path.join(uploadsDir, file.filename);
    const stats = fs.statSync(filePath);

    // Save to database
    const result = await db.addSoundEffect(
      name,
      file.filename,
      file.originalname,
      stats.size
    );

    res.status(200).json({
      success: true,
      message: 'Sound effect uploaded successfully',
      soundEffect: {
        id: Number(result.insertId), // Convert BigInt to Number
        name,
        filename: file.filename,
        originalName: file.originalname,
        fileSize: stats.size,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up file if database save failed
    if (req.file) {
      const filePath = path.join(uploadsDir, req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    if (error.message === 'Only audio files are allowed!') {
      return res.status(400).json({ error: 'Only audio files are allowed' });
    }
    
    res.status(500).json({ error: 'Failed to upload sound effect' });
  }
}

module.exports = cors(requireAuth(handler));
