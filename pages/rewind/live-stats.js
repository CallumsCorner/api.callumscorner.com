const db = require('../../lib/database');
const cors = require('../../lib/cors');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get live counters from Settings table
    const queueRefreshCount = await db.getSetting('rewindQueueRefreshCount') || '0';
    //const donationSkipCount = await db.getSetting('rewindDonationSkipCount') || '0';
    //const mediaSkipCount = await db.getSetting('rewindMediaSkipCount') || '0';
    const ttsPreviewCount = await db.getSetting('rewindTTSPreviewCount') || '0';
    let networkRequestsCount = parseInt(await db.getSetting('rewindNetworkRequestsCount') || '0');

    // Total skips = donation skips + media skips
    //const totalSkipCount = parseInt(donationSkipCount) + parseInt(mediaSkipCount);

    res.status(200).json({
      queueRefreshCount: parseInt(queueRefreshCount),
      //donationSkipCount: parseInt(donationSkipCount),
      //mediaSkipCount: parseInt(mediaSkipCount),
      //totalSkipCount,
      ttsPreviewCount: parseInt(ttsPreviewCount),
      networkRequestsCount,
    });

  } catch (error) {
    console.error('Live stats error:', error);
    res.status(500).json({ error: 'Failed to fetch live stats' });
  }
}

module.exports = cors(handler);
