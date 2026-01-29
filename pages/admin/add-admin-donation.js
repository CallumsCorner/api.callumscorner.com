const { requireAdmin } = require('../../lib/auth');
const db = require('../../lib/database');
const cors = require('../../lib/cors');

// Helper to get YouTube metadata (can be moved to a shared lib later)
const extractYouTubeVideoId = (url) => {
  if (!url) return null;
  const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

const getYouTubeMetadata = async (videoId) => {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (response.ok) {
      const data = await response.json();
      return {
        title: data.title || `YouTube Video ${videoId}`,
        thumbnail: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/default.jpg`,
        duration: 0
      };
    }
  } catch (error) {
    console.error('Failed to get YouTube metadata:', error);
  }
  return {
    title: `YouTube Video ${videoId}`,
    thumbnail: `https://img.youtube.com/vi/${videoId}/default.jpg`,
    duration: 0
  };
};


async function handler(req, res) {
  // only the user 'matt' can use this
  if (req.user.username !== 'matt') {
    return res.status(403).json({ error: 'Forbidden: This action is restricted to matt.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, amount, message, mediaUrl, mediaStartTime, bypassFilter } = req.body;

    if (!name || !amount) {
      return res.status(400).json({ error: 'Name and amount are required.' });
    }

    const orderId = `ADMIN_FREE_${Date.now()}`;
    const cleanAmount = parseFloat(amount);

    // Store original data for background processing
    const originalName = name;
    const originalMessage = message || '';

    // Process everything in background (non-blocking) - filtering AND queue addition
    setImmediate(async () => {
      try {
        let finalName = originalName;
        let finalMessage = originalMessage;

        // Apply filter unless bypass is enabled
        if (bypassFilter !== true) {
          // Apply filtering in a SINGLE AI request (more efficient)
          const [nameFilterResult, messageFilterResult] = await db.applyFilterBatch([
            originalName,
            originalMessage
          ]);
          finalName = nameFilterResult.filtered;
          finalMessage = messageFilterResult.filtered;
        }

        await db.addDonationToQueue({
          order_id: orderId,
          name: finalName,
          amount: cleanAmount,
          message: finalMessage,
          originalMessage: originalMessage,
          payer_id: 'ADMIN',
          is_replay: false
        });

        console.log(`Added manual donation ${orderId} to queue (bypass: ${bypassFilter})`);

        let mediaAdded = false;

        // Add to media queue if media URL provided
        if (mediaUrl) {
          const videoId = extractYouTubeVideoId(mediaUrl);
          if (videoId) {
            try {
              const mediaMetadata = await getYouTubeMetadata(videoId);
              await db.addMediaToQueue({
                order_id: orderId,
                donor_name: finalName,
                media_url: mediaUrl,
                media_start_time: mediaStartTime || 0,
                video_title: mediaMetadata.title,
                payer_id: 'ADMIN',
                is_replay: false
              });
              mediaAdded = true;
              if (global.broadcastToClients) {
                global.broadcastToClients({ type: 'media-queue-updated', newMedia: true });
              }
            } catch (error) {
              console.error('Failed to add manual donation media to queue:', error);
            }
          }
        }

        // Notify overlay of new donation
        if (global.broadcastToClients) {
          global.broadcastToClients({ type: 'donation-queue-updated', newDonation: true });
        }

        console.log(`Complete for manual donation ${orderId}:`, {
          orderId,
          name: finalName,
          amount: cleanAmount,
          mediaAdded,
          bypassed: bypassFilter
        });

      } catch (error) {
        console.error(`Failed to process manual donation ${orderId}:`, error);
      }
    });

    // Return success immediately without waiting for processing
    res.status(200).json({ success: true, message: 'Free donation added successfully.' });

  } catch (error) {
    console.error('Add free donation error:', error);
    res.status(500).json({ error: 'Internal server error. Contact kernelscorner on discord' });
  }
}

module.exports = cors(requireAdmin(handler));