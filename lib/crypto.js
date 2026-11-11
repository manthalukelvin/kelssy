import { randomBytes, createCipheriv, createDecipheriv, createHmac, timingSafeEqual } from 'node:crypto';
import { TOKEN_ENCRYPTION_KEY, SESSION_SECRET } from './config.js';

export function encryptionKey() {
  const value = TOKEN_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    const err = new Error('TOKEN_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    err.status = 503;
    err.code = 'BAD_ENCRYPTION_KEY';
    throw err;
  }
  return Buffer.from(value, 'hex');
}

export function encryptJson(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    data: ciphertext.toString('hex')
  };
}

export function decryptJson(payload) {
  if (!payload || payload.v !== 1) throw new Error('Unsupported encrypted payload version');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(payload.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'hex')),
    decipher.final()
  ]).toString('utf8');
  return JSON.parse(plain);
}

/** Simple signed session token (no external deps) */
export function signSession(payload, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const body = Buffer.from(JSON.stringify({
    ...payload,
    exp: Date.now() + maxAgeMs
  })).toString('base64url');
  const sig = createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}
