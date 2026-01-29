const fs = require('fs');
const path = require('path');

module.exports = function handler(req, res) {
  const { filename } = req.params;
  
  if (!filename) {
    return res.status(400).json({ error: 'Filename is required' });
  }

  const filePath = path.join(process.cwd(), 'public', 'uploads', 'sounds', filename);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Get file stats
  const stats = fs.statSync(filePath);
  
  // Set proper headers for audio
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Length', stats.size);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  
  // Handle range requests for audio seeking
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
    const chunksize = (end - start) + 1;
    
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
    res.setHeader('Content-Length', chunksize);
    
    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
  } else {
    // Stream the entire file
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }
}
