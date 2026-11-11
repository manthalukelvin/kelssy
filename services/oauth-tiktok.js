/**
 * TikTok Login Kit OAuth 2.0 + token management
 *
 * Authorize:  https://www.tiktok.com/v2/auth/authorize/
 * Token:      https://open.tiktokapis.com/v2/oauth/token/
 * Refresh:    same token endpoint with grant_type=refresh_token
 *
 * Important:
 * - Redirect URI must be HTTPS in production (exact match, no query/hash)
 * - Scopes beyond user.info.basic often need pre-approval
 * - Content Posting API (video.publish) requires audit for public posts
 * - Until audited, Direct Post is limited to private / SELF_ONLY
 */
import { randomBytes } from 'node:crypto';
import { readConnections, writeConnections, appendActivity } from '../lib/storage.js';

const oauthStates = new Map();

const TIKTOK_AUTH = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_USER_INFO = 'https://open.tiktokapis.com/v2/user/info/';

// Baseline scopes. Add video.publish / video.upload only after app approval.
const DEFAULT_SCOPES = [
  'user.info.basic',
  'user.info.profile',
  'user.info.stats',
  'video.list'
].join(',');

function requireTikTokConfig() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI
    || 'http://127.0.0.1:3000/api/oauth/tiktok/callback';

  if (!clientKey || !clientSecret) {
    const err = new Error('TikTok OAuth is not configured. Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in .env');
    err.status = 503;
    err.code = 'TIKTOK_NOT_CONFIGURED';
    throw err;
  }
  return { clientKey, clientSecret, redirectUri };
}

export function isTikTokConfigured() {
  return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
}

/**
 * Start TikTok Login Kit authorization
 */
export function startTikTokOAuth() {
  const { clientKey, redirectUri } = requireTikTokConfig();
  const state = randomBytes(24).toString('hex');
  oauthStates.set(state, { createdAt: Date.now() });

  for (const [k, v] of oauthStates) {
    if (Date.now() - v.createdAt > 15 * 60 * 1000) oauthStates.delete(k);
  }

  const params = new URLSearchParams({
    client_key: clientKey,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: process.env.TIKTOK_SCOPES || DEFAULT_SCOPES,
    state
  });

  return {
    url: `${TIKTOK_AUTH}?${params.toString()}`,
    state
  };
}

/**
 * Handle callback: exchange code for access + refresh tokens
 */
export async function handleTikTokCallback({ code, state, error, error_description }) {
  if (error) {
    const err = new Error(`TikTok authorization denied: ${error_description || error}`);
    err.status = 400;
    err.code = 'TIKTOK_AUTH_DENIED';
    throw err;
  }
  if (!code || !state) {
    const err = new Error('Missing code or state from TikTok callback');
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

  const { clientKey, clientSecret, redirectUri } = requireTikTokConfig();

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri
  });

  const tokenRes = await fetch(TIKTOK_TOKEN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache'
    },
    body
  });

  const tokenJson = await tokenRes.json();
  // TikTok wraps data under .data in many responses
  const tokenData = tokenJson.data || tokenJson;

  if (!tokenRes.ok || !tokenData.access_token) {
    const msg = tokenJson.error_description || tokenJson.error || tokenData.error_description
      || tokenData.description || 'Failed to exchange code for TikTok tokens';
    const err = new Error(msg);
    err.status = 502;
    err.code = 'TIKTOK_TOKEN_EXCHANGE_FAILED';
    err.detail = tokenJson;
    throw err;
  }

  // Fetch basic user info
  let profile = {};
  try {
    const infoRes = await fetch(`${TIKTOK_USER_INFO}?fields=open_id,union_id,avatar_url,display_name,bio_description,is_verified,follower_count,following_count,likes_count,video_count`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`
      }
    });
    const infoJson = await infoRes.json();
    if (infoRes.ok) {
      profile = infoJson.data?.user || infoJson.data || infoJson;
    }
  } catch { /* non-fatal */ }

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
    : null;
  const refreshExpiresAt = tokenData.refresh_expires_in
    ? new Date(Date.now() + Number(tokenData.refresh_expires_in) * 1000).toISOString()
    : null;

  const record = {
    provider: 'tiktok',
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || null,
    tokenType: tokenData.token_type || 'Bearer',
    scope: tokenData.scope || DEFAULT_SCOPES,
    expiresAt,
    refreshExpiresAt,
    openId: tokenData.open_id || profile.open_id,
    connectedAt: new Date().toISOString(),
    accountName: profile.display_name || tokenData.open_id || 'TikTok account',
    picture: profile.avatar_url || null,
    extra: {
      openId: tokenData.open_id || profile.open_id,
      unionId: tokenData.union_id || profile.union_id,
      bio: profile.bio_description,
      isVerified: profile.is_verified,
      followerCount: profile.follower_count,
      followingCount: profile.following_count,
      likesCount: profile.likes_count,
      videoCount: profile.video_count
    }
  };

  const saved = await readConnections();
  // Preserve previous refresh token if TikTok did not return a new one
  if (!record.refreshToken && saved.tiktok?.refreshToken) {
    record.refreshToken = saved.tiktok.refreshToken;
  }
  saved.tiktok = record;
  await writeConnections(saved);

  await appendActivity({
    type: 'oauth_connect',
    summary: `Connected TikTok as ${record.accountName}`,
    data: { openId: record.openId }
  });

  return record;
}

/**
 * Refresh access token
 */
export async function refreshTikTokToken() {
  const saved = await readConnections();
  const conn = saved.tiktok;
  if (!conn?.refreshToken) {
    const err = new Error('TikTok is not connected or has no refresh token. Reconnect the account.');
    err.status = 401;
    err.code = 'NEEDS_RECONNECT';
    throw err;
  }

  const { clientKey, clientSecret } = requireTikTokConfig();
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: conn.refreshToken
  });

  const res = await fetch(TIKTOK_TOKEN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache'
    },
    body
  });

  const json = await res.json();
  const data = json.data || json;

  if (!res.ok || !data.access_token) {
    const err = new Error(json.error_description || data.description || 'Failed to refresh TikTok token. Reconnect.');
    err.status = 401;
    err.code = 'REFRESH_FAILED';
    throw err;
  }

  conn.accessToken = data.access_token;
  if (data.refresh_token) conn.refreshToken = data.refresh_token;
  conn.expiresAt = data.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
    : null;
  if (data.refresh_expires_in) {
    conn.refreshExpiresAt = new Date(Date.now() + Number(data.refresh_expires_in) * 1000).toISOString();
  }
  saved.tiktok = conn;
  await writeConnections(saved);
  return conn.accessToken;
}

export async function getValidTikTokAccessToken() {
  const saved = await readConnections();
  const conn = saved.tiktok;
  if (!conn?.accessToken) {
    const err = new Error('TikTok is not connected');
    err.status = 401;
    err.code = 'NOT_CONNECTED';
    throw err;
  }

  const expiresSoon = conn.expiresAt && (new Date(conn.expiresAt).getTime() - Date.now() < 10 * 60 * 1000);
  if (expiresSoon && conn.refreshToken) {
    return refreshTikTokToken();
  }
  return conn.accessToken;
}

/**
 * Fetch current user profile / stats
 */
export async function fetchTikTokProfile() {
  const accessToken = await getValidTikTokAccessToken();
  const res = await fetch(
    `${TIKTOK_USER_INFO}?fields=open_id,union_id,avatar_url,display_name,bio_description,is_verified,follower_count,following_count,likes_count,video_count`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json.error?.message || json.error_description || 'Failed to fetch TikTok profile');
    err.status = res.status;
    err.code = 'TIKTOK_API_ERROR';
    throw err;
  }
  const user = json.data?.user || json.data || json;
  return {
    connected: true,
    profile: {
      openId: user.open_id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      bio: user.bio_description,
      isVerified: user.is_verified,
      followerCount: user.follower_count,
      followingCount: user.following_count,
      likesCount: user.likes_count,
      videoCount: user.video_count
    }
  };
}
