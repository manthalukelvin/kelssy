/**
 * POST /api/payments/verify-paypal
 * Body: { orderId: "..." }
 * Header: Authorization: Bearer <Firebase ID token>
 *
 * Captures the payment and activates Premium for the user.
 */
import { verifyIdToken, admin } from '../lib/firebase-admin.js';
import { capturePayPalOrder } from '../lib/paypal.js';

export default async function handler(req, res) {
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

    const { orderId } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    // 2. Capture the payment on PayPal
    const capture = await capturePayPalOrder(orderId);

    if (capture.status !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: `Payment status is ${capture.status}. Not completed yet.`,
      });
    }

    // 3. Extract plan from custom_id (we stored uid|plan when creating the order)
    const purchaseUnit = capture.purchase_units?.[0] || {};
    const captureDetails = purchaseUnit.payments?.captures?.[0] || {};
    const customId = captureDetails.custom_id || purchaseUnit.custom_id || '';

    const [paidUid, plan] = customId.split('|');

    if (!paidUid || paidUid !== uid) {
      console.error('UID mismatch:', { paidUid, currentUid: uid, customId });
      return res.status(403).json({ error: 'This payment does not belong to the signed-in user' });
    }

    // 4. Activate Premium in Firebase
    // Adjust the path / structure to match what you already use for PayChangu
    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);

    await userRef.set(
      {
        premium: true,
        plan: plan || 'lifetime',
        premiumSince: admin.firestore.FieldValue.serverTimestamp(),
        paymentProvider: 'paypal',
        lastPaymentId: orderId,
        lastPaymentAmount: captureDetails.amount?.value || null,
        lastPaymentCurrency: captureDetails.amount?.currency_code || 'USD',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Optional: also write a payment record
    await db.collection('payments').add({
      uid,
      provider: 'paypal',
      orderId,
      plan: plan || 'lifetime',
      amount: captureDetails.amount?.value || null,
      currency: captureDetails.amount?.currency_code || 'USD',
      status: 'completed',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true,
      plan: plan || 'lifetime',
      orderId,
    });
  } catch (err) {
    console.error('verify-paypal error:', err.message);
    return res.status(400).json({
      success: false,
      error: err.message || 'Verification failed',
    });
  }
}
