/**
 * Meta / Instagram OAuth 2.0 (Business Login for Instagram style)
 *
 * Flow (2025/2026):
 * 1. Redirect to https://www.instagram.com/oauth/authorize
 * 2. Exchange code at https://api.instagram.com/oauth/access_token  (short-lived ~1h)
 * 3. Exchange short-lived → long-lived at https://graph.instagram.com/access_token (60 days)
 * 4. Optional refresh of long-lived token
 *
 * For Page-linked Facebook Login the hosts differ (graph.facebook.com). This module
 * prioritises the Instagram Login path which does not require a Facebook Page.
 * You can still use the same vault for Facebook Page tokens if you extend later.
 */
import { randomBytes } from 'node:crypto';
import { readConnections, writeConnections, appendActivity } from '../lib/storage.js';

const oauthStates = new Map();

const INSTAGRAM_AUTH = 'https://www.instagram.com/oauth/authorize';
const INSTAGRAM_TOKEN = 'https://api.instagram.com/oauth/access_token';
const INSTAGRAM_LONG_LIVED = 'https://graph.instagram.com/access_token';
const INSTAGRAM_REFRESH = 'https://graph.instagram.com/refresh_access_token';
const INSTAGRAM_ME = 'https://graph.instagram.com/me';

// Scopes for Business Login for Instagram (content + basic profile)
// Note: publishing scopes often require App Review.
const DEFAULT_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_comments'
].join(',');

function requireMetaConfig() {
  const clientId = process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID;
  const clientSecret = process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI || process.env.INSTAGRAM_REDIRECT_URI
    || 'http://127.0.0.1:3000/api/oauth/meta/callback';

  if (!clientId || !clientSecret) {
    const err = new Error('Meta / Instagram OAuth is not configured. Set META_APP_ID and META_APP_SECRET in .env');
    err.status = 503;
    err.code = 'META_NOT_CONFIGURED';
    throw err;
  }
  return { clientId, clientSecret, redirectUri };
}

export function isMetaConfigured() {
  return Boolean(
    (process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID) &&
    (process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET)
  );
}

/**
 * Start Instagram Business Login
 */
export function startMetaOAuth() {
  const { clientId, redirectUri } = requireMetaConfig();
  const state = randomBytes(24).toString('hex');
  oauthStates.set(state, { createdAt: Date.now() });

  for (const [k, v] of oauthStates) {
    if (Date.now() - v.createdAt > 15 * 60 * 1000) oauthStates.delete(k);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: process.env.META_SCOPES || DEFAULT_SCOPES,
    state
  });

  return {
    url: `${INSTAGRAM_AUTH}?${params.toString()}`,
    state
  };
}

/**
 * Handle callback: code → short-lived → long-lived token + profile
 */
export async function handleMetaCallback({ code, state, error }) {
  if (error) {
    const err = new Error(`Meta / Instagram authorization denied: ${error}`);
    err.status = 400;
    err.code = 'META_AUTH_DENIED';
    throw err;
  }
  if (!code || !state) {
    const err = new Error('Missing code or state from Meta callback');
    err.status = 400;
    err.code = 'BAD_CALLBACK';
    throw err;
  }
  if (!oauthStates.has(state)) {
    const err = new Error('Invalid or expired OAuth state. Try connecting again.');
    err.status = 400;
    err.code = 'INVALID_STATE';
    throw err;
  }
  oauthStates.delete(state);

  const { clientId, clientSecret, redirectUri } = requireMetaConfig();

  // 1. Exchange code for short-lived token
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code
  });

  const shortRes = await fetch(INSTAGRAM_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form
  });
  const shortData = await shortRes.json();

  if (!shortRes.ok || !shortData.access_token) {
    const err = new Error(shortData.error_message || shortData.error?.message || shortData.error || 'Failed to exchange code for short-lived token');
    err.status = 502;
    err.code = 'META_TOKEN_EXCHANGE_FAILED';
    err.detail = shortData;
    throw err;
  }

  const shortLived = shortData.access_token;
  const userId = shortData.user_id || shortData.user?.id;

  // 2. Exchange for long-lived token (60 days)
  let longLived = shortLived;
  let expiresIn = shortData.expires_in || 3600;
  try {
    const longUrl = new URL(INSTAGRAM_LONG_LIVED);
    longUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longUrl.searchParams.set('client_secret', clientSecret);
    longUrl.searchParams.set('access_token', shortLived);

    const longRes = await fetch(longUrl.toString());
    const longData = await longRes.json();
    if (longRes.ok && longData.access_token) {
      longLived = longData.access_token;
      expiresIn = longData.expires_in || 5184000; // ~60 days
    }
  } catch {
    // Keep short-lived if exchange fails
  }

  // 3. Fetch basic profile
  let profile = { id: userId };
  try {
    const meUrl = `${INSTAGRAM_ME}?fields=id,username,account_type,media_count,name&access_token=${longLived}`;
    const meRes = await fetch(meUrl);
    if (meRes.ok) {
      profile = await meRes.json();
    }
  } catch { /* non-fatal */ }

  const expiresAt = new Date(Date.now() + Number(expiresIn) * 1000).toISOString();

  const record = {
    provider: 'meta',
    accessToken: longLived,
    refreshToken: null, // Instagram long-lived uses a different refresh endpoint
    tokenType: 'Bearer',
    expiresAt,
    connectedAt: new Date().toISOString(),
    accountName: profile.username || profile.name || `IG ${userId}`,
    userId: profile.id || userId,
    extra: {
      username: profile.username,
      accountType: profile.account_type,
      mediaCount: profile.media_count,
      name: profile.name
    }
  };

  const saved = await readConnections();
  saved.meta = record;
  await writeConnections(saved);

  await appendActivity({
    type: 'oauth_connect',
    summary: `Connected Instagram / Meta as ${record.accountName}`,
    data: { userId: record.userId, username: record.extra?.username }
  });

  return record;
}

/**
 * Refresh a long-lived Instagram token (must be at least 24h old, extends another 60 days)
 */
export async function refreshMetaToken() {
  const saved = await readConnections();
  const conn = saved.meta;
  if (!conn?.accessToken) {
    const err = new Error('Meta / Instagram is not connected');
    err.status = 401;
    err.code = 'NOT_CONNECTED';
    throw err;
  }

  const url = new URL(INSTAGRAM_REFRESH);
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', conn.accessToken);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    const err = new Error(data.error?.message || 'Failed to refresh Instagram token. Reconnect the account.');
    err.status = 401;
    err.code = 'REFRESH_FAILED';
    throw err;
  }

  conn.accessToken = data.access_token;
  conn.expiresAt = data.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
    : null;
  saved.meta = conn;
  await writeConnections(saved);
  return conn.accessToken;
}

/**
 * Return a usable access token (refresh if close to expiry)
 */
export async function getValidMetaAccessToken() {
  const saved = await readConnections();
  const conn = saved.meta;
  if (!conn?.accessToken) {
    const err = new Error('Meta / Instagram is not connected');
    err.status = 401;
    err.code = 'NOT_CONNECTED';
    throw err;
  }

  const expiresSoon = conn.expiresAt && (new Date(conn.expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000);
  if (expiresSoon) {
    try {
      return await refreshMetaToken();
    } catch {
      // fall through to current token; caller may still get 401 from API
    }
  }
  return conn.accessToken;
}

/**
 * Basic profile / media count snapshot
 */
export async function fetchMetaProfile() {
  const accessToken = await getValidMetaAccessToken();
  const url = `${INSTAGRAM_ME}?fields=id,username,account_type,media_count,name&access_token=${accessToken}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error?.message || 'Failed to fetch Instagram profile');
    err.status = res.status;
    err.code = 'META_API_ERROR';
    throw err;
  }
  return {
    connected: true,
    profile: {
      id: data.id,
      username: data.username,
      name: data.name,
      accountType: data.account_type,
      mediaCount: data.media_count
    }
  };
}
