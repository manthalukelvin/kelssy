import bcrypt from 'bcryptjs';
import { APP_PASSWORD, APP_PASSWORD_HASH } from './config.js';
import { signSession, verifySession } from './crypto.js';

const COOKIE_NAME = 'celma_session';

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain) {
  if (APP_PASSWORD_HASH) {
    return bcrypt.compare(plain, APP_PASSWORD_HASH);
  }
  if (!APP_PASSWORD || APP_PASSWORD === 'change-me-to-a-very-strong-password') {
    // Allow first-run with the default only in development
    if (process.env.NODE_ENV === 'production') return false;
    return plain === APP_PASSWORD || plain === 'change-me-to-a-very-strong-password';
  }
  // Prefer hash, but for simplicity allow plain comparison only if no hash is set
  // In production you should always set APP_PASSWORD_HASH
  return plain === APP_PASSWORD;
}

export function createSessionCookie(res, payload = { role: 'owner' }) {
  const token = signSession(payload);
  const isProd = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    isProd ? 'Secure' : '',
    'Max-Age=604800'
  ].filter(Boolean).join('; '));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

export function getSessionFromRequest(req) {
  const raw = req.cookies?.[COOKIE_NAME] || (req.headers.cookie || '')
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(`${COOKIE_NAME}=`))
    ?.split('=')[1];
  if (!raw) return null;
  return verifySession(raw);
}

/** Middleware – protects all /api/* except login, health & OAuth callbacks */
export function requireAuth(req, res, next) {
  const publicExact = new Set([
    '/api/health',
    '/api/auth/login',
    '/api/auth/status',
    '/api/oauth/google/callback',
    '/api/oauth/meta/callback',
    '/api/oauth/tiktok/callback',
    '/api/cron/tick'
  ]);
  if (publicExact.has(req.path)) {
    return next();
  }
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required. Please log in.', code: 'UNAUTHORIZED' });
  }
  req.session = session;
  next();
}
