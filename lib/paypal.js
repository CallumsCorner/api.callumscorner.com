const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';

const PAYPAL_BASE_URL = PAYPAL_MODE === 'live' 
  ? 'https://api-m.paypal.com' 
  : 'https://api-m.sandbox.paypal.com';

// Get PayPal access token
async function getAccessToken() {
  console.log('PayPal Config:', {
    mode: PAYPAL_MODE,
    baseUrl: PAYPAL_BASE_URL,
    clientIdLength: PAYPAL_CLIENT_ID?.length,
    secretLength: PAYPAL_CLIENT_SECRET?.length
  });

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json();
  
  console.log('PayPal Auth Response:', {
    status: response.status,
    success: !!data.access_token,
    error: data.error,
    errorDescription: data.error_description
  });

  if (!data.access_token) {
    console.error('PayPal Auth Failed:', data);
    throw new Error(`PayPal authentication failed: ${data.error_description || 'Unknown error'}`);
  }

  return data.access_token;
}


// Create PayPal order
async function createPayPalOrder(amount, currency = 'GBP') {
  try {
    console.log('Creating PayPal order:', { amount, currency });
    const accessToken = await getAccessToken();
    
    const orderData = {
      intent: 'CAPTURE',
      purchase_units: [{
        description: "Tip to Callum's Corner",
        amount: {
          currency_code: currency,
          value: amount.toString(),
        },
      }],
      application_context: {
        return_url: process.env.PAYPAL_RETURN_URL || `https://donate.callumscorner.com`,
        cancel_url: process.env.PAYPAL_CANCEL_URL || `https://donate.callumscorner.com`,
        shipping_preference: 'NO_SHIPPING' // paypal needs to consider this a digital good, otherwise it starts offering tracking details and supplies me with user's addresses
      },
    };

    console.log('PayPal Order Request:', JSON.stringify(orderData, null, 2));
    
    const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    });

    const order = await response.json();
    
    console.log('PayPal Order Response:', {
      status: response.status,
      orderStatus: order.status,
      orderId: order.id,
      error: order.error,
      details: order.details
    });

    if (!response.ok || !order.id) {
      console.error('PayPal Order Creation Failed:', order);
      throw new Error(`PayPal order creation failed: ${order.error?.message || 'Unknown error'}`);
    }

    return order;
  } catch (error) {
    console.error('Error creating PayPal order:', error);
    throw error;
  }
}

// Capture PayPal payment
async function capturePayPalPayment(orderID) {
  try {
    const accessToken = await getAccessToken();
    
    const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const captureData = await response.json();
    return captureData;
  } catch (error) {
    console.error('Error capturing PayPal payment:', error);
    throw error;
  }
}

// Get PayPal order details
async function getPayPalOrderDetails(orderID) {
  try {
    const accessToken = await getAccessToken();
    
    const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderID}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const orderData = await response.json();
    return orderData;
  } catch (error) {
    console.error('Error getting PayPal order details:', error);
    throw error;
  }
}

module.exports = {
  createPayPalOrder,
  capturePayPalPayment,
  getPayPalOrderDetails,
};
