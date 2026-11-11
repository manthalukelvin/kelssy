/**
 * Facebook Login → Page access tokens
 * Flow: authorize → user token → /me/accounts → store page token(s)
 */
import { randomBytes } from 'node:crypto';
import { readConnections, writeConnections, appendActivity } from '../lib/storage.js';

const oauthStates = new Map();
const FB_AUTH = 'https://www.facebook.com/v21.0/dialog/oauth';
const FB_TOKEN = 'https://graph.facebook.com/v21.0/oauth/access_token';
const FB_GRAPH = 'https://graph.facebook.com/v21.0';

const DEFAULT_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
  'public_profile'
].join(',');

function requireFacebookConfig() {
  // Reuse META_* credentials (same Meta app) or dedicated FACEBOOK_* vars
  const clientId = process.env.FACEBOOK_APP_ID || process.env.META_APP_ID;
  const clientSecret = process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI
    || process.env.META_REDIRECT_URI
    || 'http://127.0.0.1:3000/api/oauth/facebook/callback';

  if (!clientId || !clientSecret) {
    const err = new Error('Facebook OAuth is not configured. Set META_APP_ID + META_APP_SECRET (or FACEBOOK_APP_ID + FACEBOOK_APP_SECRET).');
    err.status = 503;
    err.code = 'FACEBOOK_NOT_CONFIGURED';
    throw err;
  }
  return { clientId, clientSecret, redirectUri };
}

export function isFacebookConfigured() {
  return Boolean(
    (process.env.FACEBOOK_APP_ID || process.env.META_APP_ID) &&
    (process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET)
  );
}

export function startFacebookOAuth() {
  const { clientId, redirectUri } = requireFacebookConfig();
  const state = randomBytes(24).toString('hex');
  oauthStates.set(state, { createdAt: Date.now() });
  for (const [k, v] of oauthStates) {
    if (Date.now() - v.createdAt > 15 * 60 * 1000) oauthStates.delete(k);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    scope: process.env.FACEBOOK_SCOPES || DEFAULT_SCOPES
  });

  return { url: `${FB_AUTH}?${params.toString()}`, state };
}

export async function handleFacebookCallback({ code, state, error, error_description }) {
  if (error) {
    const err = new Error(`Facebook authorization denied: ${error_description || error}`);
    err.status = 400;
    err.code = 'FACEBOOK_AUTH_DENIED';
    throw err;
  }
  if (!code || !state || !oauthStates.has(state)) {
    const err = new Error('Invalid or missing OAuth state/code. Try connecting again.');
    err.status = 400;
    err.code = 'INVALID_STATE';
    throw err;
  }
  oauthStates.delete(state);

  const { clientId, clientSecret, redirectUri } = requireFacebookConfig();

  // Exchange code → short-lived user token
  const tokenUrl = new URL(FB_TOKEN);
  tokenUrl.searchParams.set('client_id', clientId);
  tokenUrl.searchParams.set('client_secret', clientSecret);
  tokenUrl.searchParams.set('redirect_uri', redirectUri);
  tokenUrl.searchParams.set('code', code);

  const tokenRes = await fetch(tokenUrl.toString());
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    const err = new Error(tokenData.error?.message || 'Failed to exchange Facebook code');
    err.status = 502;
    err.code = 'FB_TOKEN_EXCHANGE_FAILED';
    err.detail = tokenData;
    throw err;
  }

  let userToken = tokenData.access_token;
  let expiresAt = tokenData.expires_in
    ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
    : null;

  // Exchange for long-lived user token (~60 days)
  try {
    const llUrl = new URL(FB_TOKEN);
    llUrl.searchParams.set('grant_type', 'fb_exchange_token');
    llUrl.searchParams.set('client_id', clientId);
    llUrl.searchParams.set('client_secret', clientSecret);
    llUrl.searchParams.set('fb_exchange_token', userToken);
    const llRes = await fetch(llUrl.toString());
    const llData = await llRes.json();
    if (llRes.ok && llData.access_token) {
      userToken = llData.access_token;
      expiresAt = llData.expires_in
        ? new Date(Date.now() + Number(llData.expires_in) * 1000).toISOString()
        : null;
    }
  } catch { /* keep short-lived */ }

  // List pages the user manages
  const pagesRes = await fetch(
    `${FB_GRAPH}/me/accounts?fields=id,name,access_token,category,tasks,picture&limit=50&access_token=${userToken}`
  );
  const pagesData = await pagesRes.json();
  if (!pagesRes.ok) {
    const err = new Error(pagesData.error?.message || 'Failed to list Facebook Pages');
    err.status = 502;
    err.code = 'FB_PAGES_LIST_FAILED';
    err.detail = pagesData;
    throw err;
  }

  const pages = (pagesData.data || []).map(p => ({
    id: p.id,
    name: p.name,
    accessToken: p.access_token,
    category: p.category,
    tasks: p.tasks || [],
    picture: p.picture?.data?.url || null
  }));

  if (!pages.length) {
    const err = new Error('No Facebook Pages found for this account. Create a Page or ensure you have a role on one.');
    err.status = 400;
    err.code = 'NO_PAGES';
    throw err;
  }

  // Default to first page (user can switch later via API)
  const primary = pages[0];

  const record = {
    provider: 'facebook',
    // Store page token as the working token for publishing
    accessToken: primary.accessToken,
    userAccessToken: userToken,
    refreshToken: null,
    tokenType: 'Bearer',
    expiresAt, // user token expiry; page tokens from long-lived user tokens generally do not expire
    connectedAt: new Date().toISOString(),
    accountName: primary.name,
    pageId: primary.id,
    pages,
    extra: {
      pageCount: pages.length,
      category: primary.category
    }
  };

  const saved = await readConnections();
  saved.facebook = record;
  await writeConnections(saved);

  await appendActivity({
    type: 'oauth_connect',
    summary: `Connected Facebook Page: ${primary.name}`,
    data: { pageId: primary.id, pageCount: pages.length }
  });

  return record;
}

export async function getFacebookPageToken(pageId = null) {
  const saved = await readConnections();
  const conn = saved.facebook;
  if (!conn?.accessToken) {
    const err = new Error('Facebook Page is not connected');
    err.status = 401;
    err.code = 'NOT_CONNECTED';
    throw err;
  }
  if (pageId && conn.pages?.length) {
    const page = conn.pages.find(p => p.id === pageId);
    if (!page?.accessToken) {
      const err = new Error(`Page ${pageId} not found in connected pages`);
      err.status = 404;
      err.code = 'PAGE_NOT_FOUND';
      throw err;
    }
    return { accessToken: page.accessToken, pageId: page.id, pageName: page.name };
  }
  return {
    accessToken: conn.accessToken,
    pageId: conn.pageId,
    pageName: conn.accountName
  };
}

export async function selectFacebookPage(pageId) {
  const saved = await readConnections();
  const conn = saved.facebook;
  if (!conn?.pages?.length) {
    const err = new Error('No Facebook pages connected');
    err.status = 400;
    throw err;
  }
  const page = conn.pages.find(p => p.id === pageId);
  if (!page) {
    const err = new Error('Page not found');
    err.status = 404;
    throw err;
  }
  conn.pageId = page.id;
  conn.accountName = page.name;
  conn.accessToken = page.accessToken;
  conn.extra = { ...(conn.extra || {}), category: page.category };
  saved.facebook = conn;
  await writeConnections(saved);
  return { pageId: page.id, name: page.name };
}

export async function fetchFacebookPageInfo() {
  const { accessToken, pageId } = await getFacebookPageToken();
  const res = await fetch(
    `${FB_GRAPH}/${pageId}?fields=id,name,fan_count,followers_count,category,link,picture&access_token=${accessToken}`
  );
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error?.message || 'Failed to fetch Page info');
    err.status = res.status;
    err.code = 'FB_API_ERROR';
    throw err;
  }
  return {
    connected: true,
    page: {
      id: data.id,
      name: data.name,
      fanCount: data.fan_count,
      followersCount: data.followers_count,
      category: data.category,
      link: data.link,
      picture: data.picture?.data?.url
    }
  };
}
