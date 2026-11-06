/**
 * POST /api/payments/create-paypal
 * Body: { plan: "monthly" | "yearly" | "lifetime" }
 * Header: Authorization: Bearer <Firebase ID token>
 *
 * Returns: { orderId, checkoutUrl }
 */
import { verifyIdToken } from '../lib/firebase-admin.js';
import { createPayPalOrder } from '../lib/paypal.js';

const PLANS = {
  monthly:  { amount: '2.49',  label: 'MyJournal+ Monthly Premium' },
  yearly:   { amount: '20.00', label: 'MyJournal+ Annual Premium' },
  lifetime: { amount: '49.99', label: 'MyJournal+ Lifetime Premium' },
};

export default async function handler(req, res) {
  // CORS (adjust origin if needed)
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Verify Firebase user
    const decoded = await verifyIdToken(req.headers.authorization);
    const uid = decoded.uid;
    const email = decoded.email || '';

    // 2. Validate plan
    const { plan } = req.body || {};
    if (!plan || !PLANS[plan]) {
      return res.status(400).json({ error: 'Invalid or missing plan. Use monthly, yearly or lifetime.' });
    }

    const selected = PLANS[plan];
    const origin = req.headers.origin || process.env.APP_ORIGIN || 'https://myjournalplus.com';

    // 3. Create PayPal order
    const order = await createPayPalOrder({
      amount: selected.amount,
      currency: process.env.PAYPAL_CURRENCY || 'USD',
      description: selected.label,
      customId: `${uid}|${plan}`,
      returnUrl: `${origin}/payment?provider=paypal&status=success`,
      cancelUrl: `${origin}/payment?provider=paypal&status=cancelled`,
    });

    const approveLink = order.links?.find((l) => l.rel === 'approve')?.href;

    if (!approveLink) {
      console.error('No approve link in order:', order);
      return res.status(500).json({ error: 'No approval link returned by PayPal' });
    }

    return res.status(200).json({
      orderId: order.id,
      checkoutUrl: approveLink,
      plan,
      amount: selected.amount,
    });
  } catch (err) {
    console.error('create-paypal error:', err.message);
    const status = err.message.includes('Authorization') || err.message.includes('token') ? 401 : 500;
    return res.status(status).json({ error: err.message || 'Unauthorized' });
  }
}
