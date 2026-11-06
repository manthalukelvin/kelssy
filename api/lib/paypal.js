/**
 * PayPal Orders API helpers (server-side only)
 */

const PAYPAL_API =
  process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

/**
 * Get a short-lived PayPal access token using Client Credentials
 */
export async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('PayPal token error:', data);
    throw new Error(data.error_description || data.error || 'Failed to get PayPal access token');
  }
  return data.access_token;
}

/**
 * Create a PayPal order
 */
export async function createPayPalOrder({
  amount,
  currency = 'USD',
  description,
  customId,
  returnUrl,
  cancelUrl,
}) {
  const accessToken = await getPayPalAccessToken();

  const res = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: currency,
            value: String(amount),
          },
          description: description || 'MyJournal+ Premium',
          custom_id: customId, // uid|plan
        },
      ],
      application_context: {
        brand_name: 'MyJournal+',
        landing_page: 'LOGIN',
        user_action: 'PAY_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('Create order error:', data);
    throw new Error(data.message || data.details?.[0]?.description || 'Failed to create PayPal order');
  }
  return data;
}

/**
 * Capture (complete) a PayPal order after the buyer approves it
 */
export async function capturePayPalOrder(orderId) {
  const accessToken = await getPayPalAccessToken();

  const res = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('Capture error:', data);
    throw new Error(data.message || data.details?.[0]?.description || 'Failed to capture PayPal order');
  }
  return data;
}
