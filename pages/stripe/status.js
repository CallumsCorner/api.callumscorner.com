// Check if a Stripe session has been processed
const db = require('../../lib/database');
const cors = require('../../lib/cors');
const { getStripeSession } = require('../../lib/stripe');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: 'session_id is required' });
  }

  try {
    // check if donation exists in queue (already processed)
    const existingDonation = await db.checkOrderExists(session_id);

    if (existingDonation) {
      // get the donation details to return to frontend
      const donation = await db.query(
        'SELECT name, amount, message FROM DonationQueue WHERE order_id = ? UNION SELECT name, amount, message FROM DonationHistory WHERE order_id = ?',
        [session_id, session_id]
      );

      return res.status(200).json({
        status: 'completed',
        donation: donation[0] || { name: 'Anonymous', amount: 0 }
      });
    }

    // check if still in temp table (not yet processed)
    const tempDonation = await db.query('SELECT * FROM DonationTemp WHERE order_id = ?', [session_id]);

    if (tempDonation.length > 0) {
      // still waiting for webhook to process
      // also check stripe to see if payment actually succeeded
      try {
        const session = await getStripeSession(session_id);

        if (session.payment_status === 'paid') {
          // payment succeeded but webhook hasn't processed yet
          return res.status(200).json({
            status: 'processing',
            message: 'Payment received, processing donation...'
          });
        } else if (session.payment_status === 'unpaid') {
          return res.status(200).json({
            status: 'pending',
            message: 'Waiting for payment confirmation...'
          });
        }
      } catch (stripeError) {
        console.error('Stripe error:', stripeError.message);
      }

      return res.status(200).json({
        status: 'pending',
        message: 'Waiting for payment confirmation...'
      });
    }

    // not in queue and not in temp - check if it's a valid session at all
    try {
      const session = await getStripeSession(session_id);

      if (session.payment_status === 'paid') {
        // payment was made but donation data expired from temp table
        // this shouldn't happen normally, but handle it gracefully
        return res.status(200).json({
          status: 'completed',
          message: 'Payment was successful',
          donation: {
            name: session.metadata?.name || 'Anonymous',
            amount: session.amount_total / 100
          }
        });
      } else {
        return res.status(200).json({
          status: 'cancelled',
          message: 'Payment was not completed'
        });
      }
    } catch (stripeError) {
      // session doesn't exist or is invalid
      return res.status(200).json({
        status: 'not_found',
        message: 'Session not found or expired'
      });
    }

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Failed to check status' });
  }
}

module.exports = cors(handler);
