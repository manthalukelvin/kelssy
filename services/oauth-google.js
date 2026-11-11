/**
 * Full Google / YouTube OAuth 2.0 wiring (authorization code flow)
 * Scopes: YouTube readonly + upload (you can tighten later)
 */
import { randomBytes } from 'node:crypto';
import { readConnections, writeConnections, appendActivity } from '../lib/storage.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO = 'https://www.googleapis.com/oauth2/v2/userinfo';
const YOUTUBE_CHANNELS = 'https://www.googleapis.com/youtube/v3/channels';

// In-memory state store (fine for single-user personal agent; survives process restarts poorly — use Redis/DB for multi-instance)
const oauthStates = new Map();

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

function requireGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://127.0.0.1:3000/api/oauth/google/callback';
  if (!clientId || !clientSecret) {
    const err = new Error('Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
    err.status = 503;
    err.code = 'GOOGLE_NOT_CONFIGURED';
    throw err;
  }
  return { clientId, clientSecret, redirectUri };
}

/**
 * Start OAuth — returns the authorization URL the browser should open
 */
export function startGoogleOAuth() {
  const { clientId, redirectUri } = requireGoogleConfig();
  const state = randomBytes(24).toString('hex');
  oauthStates.set(state, { createdAt: Date.now() });

  // Clean old states (> 15 min)
  for (const [k, v] of oauthStates) {
    if (Date.now() - v.createdAt > 15 * 60 * 1000) oauthStates.delete(k);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',      // important: get refresh_token
    prompt: 'consent',           // force consent so we always get refresh_token on first connect
    state,
    include_granted_scopes: 'true'
  });

  return {
    url: `${GOOGLE_AUTH_URL}?${params.toString()}`,
    state
  };
}

/**
 * Handle the callback: exchange code → tokens, fetch channel info, store encrypted
 */
export async function handleGoogleCallback({ code, state, error }) {
  if (error) {
    const err = new Error(`Google authorization denied or failed: ${error}`);
    err.status = 400;
    err.code = 'GOOGLE_AUTH_DENIED';
    throw err;
  }
  if (!code || !state) {
    const err = new Error('Missing code or state from Google callback');
    err.status = 400;
    err.code = 'BAD_CALLBACK';
    throw err;
  }
  if (!oauthStates.has(state)) {
    const err = new Error('Invalid or expired OAuth state (possible CSRF or timeout). Try connecting again.');
    err.status = 400;
    err.code = 'INVALID_STATE';
    throw err;
  }
  oauthStates.delete(state);

  const { clientId, clientSecret, redirectUri } = requireGoogleConfig();

  // Exchange authorization code for tokens
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    const err = new Error(tokenData.error_description || tokenData.error || 'Failed to exchange code for tokens');
    err.status = 502;
    err.code = 'TOKEN_EXCHANGE_FAILED';
    err.detail = tokenData;
    throw err;
  }

  // Fetch basic user profile
  let profile = {};
  try {
    const profileRes = await fetch(GOOGLE_USERINFO, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    if (profileRes.ok) profile = await profileRes.json();
  } catch { /* non-fatal */ }

  // Fetch primary YouTube channel
  let channel = null;
  try {
    const chRes = await fetch(
      `${YOUTUBE_CHANNELS}?part=snippet,statistics,contentDetails&mine=true`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    if (chRes.ok) {
      const chData = await chRes.json();
      const item = chData.items?.[0];
      if (item) {
        channel = {
          id: item.id,
          title: item.snippet?.title,
          description: item.snippet?.description?.slice(0, 300),
          customUrl: item.snippet?.customUrl,
          thumbnails: item.snippet?.thumbnails?.default?.url,
          subscriberCount: item.statistics?.subscriberCount,
          viewCount: item.statistics?.viewCount,
          videoCount: item.statistics?.videoCount
        };
      }
    }
  } catch { /* non-fatal */ }

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
    : null;

  const record = {
    provider: 'google',
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || null,
    scope: tokenData.scope || SCOPES,
    tokenType: tokenData.token_type || 'Bearer',
    expiresAt,
    connectedAt: new Date().toISOString(),
    accountName: profile.name || channel?.title || profile.email || 'YouTube account',
    email: profile.email || null,
    picture: profile.picture || channel?.thumbnails || null,
    channel,
    extra: {
      googleUserId: profile.id || null
    }
  };

  const saved = await readConnections();
  // Keep previous refresh token if Google did not return a new one
  if (!record.refreshToken && saved.google?.refreshToken) {
    record.refreshToken = saved.google.refreshToken;
  }
  saved.google = record;
  await writeConnections(saved);

  await appendActivity({
    type: 'oauth_connect',
    summary: `Connected YouTube / Google as ${record.accountName}`,
    data: { channelId: channel?.id, email: record.email }
  });

  return record;
}

/**
 * Refresh the access token if needed / expired
 */
export async function getValidGoogleAccessToken() {
  const saved = await readConnections();
  const conn = saved.google;
  if (!conn?.accessToken) {
    const err = new Error('YouTube / Google is not connected');
    err.status = 401;
    err.code = 'NOT_CONNECTED';
    throw err;
  }

  const expiresSoon = conn.expiresAt && (new Date(conn.expiresAt).getTime() - Date.now() < 5 * 60 * 1000);
  if (!expiresSoon) return conn.accessToken;

  if (!conn.refreshToken) {
    const err = new Error('Access token expired and no refresh token is available. Please reconnect YouTube.');
    err.status = 401;
    err.code = 'NEEDS_RECONNECT';
    throw err;
  }

  const { clientId, clientSecret } = requireGoogleConfig();
  const refreshRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refreshToken,
      grant_type: 'refresh_token'
    })
  });

  const data = await refreshRes.json();
  if (!refreshRes.ok || !data.access_token) {
    const err = new Error(data.error_description || 'Failed to refresh Google token. Reconnect the account.');
    err.status = 401;
    err.code = 'REFRESH_FAILED';
    throw err;
  }

  conn.accessToken = data.access_token;
  conn.expiresAt = data.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
    : null;
  if (data.refresh_token) conn.refreshToken = data.refresh_token;
  saved.google = conn;
  await writeConnections(saved);

  return conn.accessToken;
}

/**
 * Fetch current channel statistics (uses valid token)
 */
export async function fetchYouTubeChannelStats() {
  const accessToken = await getValidGoogleAccessToken();
  const res = await fetch(
    `${YOUTUBE_CHANNELS}?part=snippet,statistics,contentDetails&mine=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error?.message || 'Failed to fetch YouTube channel');
    err.status = res.status;
    err.code = 'YOUTUBE_API_ERROR';
    throw err;
  }
  const item = data.items?.[0];
  if (!item) {
    return { connected: true, channel: null, message: 'No channel found for this account' };
  }
  return {
    connected: true,
    channel: {
      id: item.id,
      title: item.snippet?.title,
      customUrl: item.snippet?.customUrl,
      description: item.snippet?.description?.slice(0, 400),
      thumbnails: item.snippet?.thumbnails,
      subscriberCount: Number(item.statistics?.subscriberCount || 0),
      viewCount: Number(item.statistics?.viewCount || 0),
      videoCount: Number(item.statistics?.videoCount || 0),
      hiddenSubscriberCount: item.statistics?.hiddenSubscriberCount
    }
  };
}

export function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
