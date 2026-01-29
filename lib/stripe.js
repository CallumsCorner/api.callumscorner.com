const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function createStripeSetupSession(amount, currency = 'gbp', donationData) {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: currency,
          product_data: {
            name: 'Tip',
            description: `Tip from ${donationData.name}`,
          },
          unit_amount: Math.round(amount * 100), // Amount in pence
        },
        quantity: 1,
      }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/`,
      metadata: donationData,
    });
    return session;
  } catch (error) {
    console.error('Error creating Stripe setup session:', error);
    throw error;
  }
}

async function getStripeSession(sessionId) {
  try {
    // Expand the payment_intent for payment mode sessions
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'customer'],
    });
    return session;
  } catch (error) {
    console.error('Error retrieving Stripe session:', error);
    throw error;
  }
}

async function createChargeFromSetup(amount, customerId, paymentMethodId) {
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Amount in pence
            currency: 'gbp',
            customer: customerId,
            payment_method: paymentMethodId,
            off_session: true,
            confirm: true, // charge immediately
        });
        return paymentIntent;
    } catch (error) {
        console.error('Error creating charge from setup intent:', error);
        throw error;
    }
}


async function getStripeSetupIntent(setupIntentId) {
  try {
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    return setupIntent;
  } catch (error) {
    console.error('Error retrieving Stripe Setup Intent:', error);
    throw error;
  }
}

module.exports = {
  createStripeSetupSession,
  getStripeSession,
  createChargeFromSetup,
  getStripeSetupIntent,
};