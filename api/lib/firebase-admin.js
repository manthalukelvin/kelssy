/**
 * Firebase Admin – shared helper for verifying ID tokens
 * Used by both PayChangu and PayPal endpoints
 */
import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    // Preferred: full service account JSON stored as a single env var
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id || 'myjournal-plus',
      });
    } else {
      // Fallback – Application Default Credentials (rare on Vercel)
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'myjournal-plus',
      });
    }
  } catch (err) {
    console.error('Firebase Admin init error:', err.message);
    throw err;
  }
}

/**
 * Verify a Firebase ID token from the Authorization header
 * @param {string} authHeader - "Bearer <idToken>"
 * @returns {Promise<admin.auth.DecodedIdToken>}
 */
export async function verifyIdToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }
  const idToken = authHeader.split('Bearer ')[1].trim();
  if (!idToken) {
    throw new Error('Empty ID token');
  }
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded; // contains uid, email, etc.
}

export { admin };
