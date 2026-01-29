// api.callumscorner.com/vod/vote
const cors = require('../../lib/cors');

async function handler(req, res) {

  return res.status(403).json({ error: 'This endpoint is currently disabled' });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = require('../../lib/database');

    // check twitch auth first
    const sessionToken = req.cookies?.twitch_session;

    if (!sessionToken) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'You must be signed in with Twitch to vote on VODs'
      });
    }

    // validate session and get user info
    const authData = await db.getTwitchSessionUser(sessionToken);

    if (!authData) {
      return res.status(401).json({
        error: 'Invalid session',
        message: 'Your Twitch session has expired. Please sign in again.'
      });
    }

    // check if banned
    const twitchPayerId = `twitch_${authData.twitch_user_id}`;
    const isBanned = await db.isUserBanned(twitchPayerId);

    if (isBanned) {
      return res.status(403).json({
        error: 'Account banned',
        message: 'Your Twitch account is banned. It cannot redeem rewards or vote on VODs.'
      });
    }

    // validate the body
    const { vodId, vote } = req.body;

    if (!vodId || typeof vote !== 'number' || vote < 1 || vote > 5) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'vodId is required and vote must be a number between 1 and 5'
      });
    }

    // check if they've already voted on this vod
    const existingVote = await db.query(
      'SELECT id, vote FROM VodVotes WHERE vod_id = ? AND twitch_user_id = ?',
      [vodId, authData.twitch_user_id]
    );

    let isUpdate = false;

    if (existingVote.length > 0) {
      // update their vote
      await db.query(
        'UPDATE VodVotes SET vote = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [vote, existingVote[0].id]
      );
      isUpdate = true;
    } else {
      // new vote
      await db.query(
        'INSERT INTO VodVotes (vod_id, twitch_user_id, vote, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [vodId, authData.twitch_user_id, vote]
      );
    }

    // get updated stats for this vod
    const stats = await db.query(
      'SELECT COUNT(*) as total_votes, AVG(vote) as average_rating FROM VodVotes WHERE vod_id = ?',
      [vodId]
    );

    const totalVotes = stats[0]?.total_votes || 0;
    const averageRating = stats[0]?.average_rating || 0;

    // log, keep for few days then comment out
    console.log(`[VOD vote] User ${authData.display_name} (${authData.twitch_user_id}) voted ${vote}/5 on VOD ${vodId}`);

    return res.status(200).json({
      success: true,
      message: isUpdate ? 'Vote updated' : 'Vote recorded',
      vodId,
      userVote: vote,
      stats: {
        totalVotes,
        averageRating: Math.round(averageRating * 10) / 10
      }
    });

  } catch (error) {
    console.error('VOD vote error:', error);
    return res.status(500).json({
      error: 'Failed to record vote',
      message: error.message
    });
  }
}

module.exports = cors(handler);
