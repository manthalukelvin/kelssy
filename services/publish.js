/**
 * Publish helpers for approved content → Meta (Instagram) & TikTok
 *
 * Design:
 * - Only posts with status === 'approved' (or force) can be published
 * - Media must be reachable via a public HTTPS URL (platforms pull the file)
 * - Results and platform IDs are stored back on the post record
 * - Clear errors when scopes / audit are missing
 */
import { readPosts, writePosts, appendActivity, readConnections } from '../lib/storage.js';
import { getValidMetaAccessToken } from './oauth-meta.js';
import { getValidTikTokAccessToken } from './oauth-tiktok.js';

const IG_GRAPH = 'https://graph.instagram.com';
const TIKTOK_INIT = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
const TIKTOK_STATUS = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getPostOrThrow(postId) {
  const posts = await readPosts();
  const post = posts.find(p => p.id === postId);
  if (!post) {
    const err = new Error('Post not found');
    err.status = 404;
    err.code = 'POST_NOT_FOUND';
    throw err;
  }
  return { post, posts };
}

async function savePost(posts, post) {
  const idx = posts.findIndex(p => p.id === post.id);
  if (idx >= 0) posts[idx] = post;
  else posts.unshift(post);
  await writePosts(posts);
}

/**
 * Instagram: create container → wait until FINISHED → media_publish
 * mediaUrl must be a public HTTPS URL Instagram can download.
 */
export async function publishToInstagram({ postId, mediaUrl, mediaType = 'IMAGE', force = false }) {
  const { post, posts } = await getPostOrThrow(postId);

  if (!force && post.status !== 'approved' && post.status !== 'published') {
    const err = new Error('Post must be approved before publishing. Approve it in the queue first.');
    err.status = 400;
    err.code = 'NOT_APPROVED';
    throw err;
  }

  if (!mediaUrl || !/^https:\/\//i.test(mediaUrl)) {
    const err = new Error('A public HTTPS mediaUrl is required (Instagram pulls the file from that URL).');
    err.status = 400;
    err.code = 'MEDIA_URL_REQUIRED';
    throw err;
  }

  const accessToken = await getValidMetaAccessToken();
  const connections = await readConnections();
  const igUserId = connections.meta?.userId;
  if (!igUserId) {
    const err = new Error('Instagram user id missing. Reconnect the Meta / Instagram account.');
    err.status = 400;
    err.code = 'MISSING_IG_USER';
    throw err;
  }

  const caption = (post.content || '').slice(0, 2200);
  const type = String(mediaType).toUpperCase();

  // 1. Create container
  const createBody = new URLSearchParams({ access_token: accessToken, caption });
  if (type === 'REELS' || type === 'VIDEO') {
    createBody.set('media_type', 'REELS');
    createBody.set('video_url', mediaUrl);
    createBody.set('share_to_feed', 'true');
  } else {
    createBody.set('image_url', mediaUrl);
  }

  const createRes = await fetch(`${IG_GRAPH}/v21.0/${igUserId}/media`, {
    method: 'POST',
    body: createBody
  });
  const createData = await createRes.json();
  if (!createRes.ok || !createData.id) {
    const msg = createData.error?.message || JSON.stringify(createData);
    const err = new Error(`Instagram container create failed: ${msg}`);
    err.status = createRes.status || 502;
    err.code = 'IG_CONTAINER_FAILED';
    err.detail = createData;
    throw err;
  }
  const containerId = createData.id;

  // 2. Poll status (videos need processing time)
  let status = 'IN_PROGRESS';
  let lastStatusPayload = null;
  for (let i = 0; i < 40; i++) {
    await sleep(i < 5 ? 2000 : 3000);
    const stRes = await fetch(
      `${IG_GRAPH}/v21.0/${containerId}?fields=status_code,status&access_token=${accessToken}`
    );
    lastStatusPayload = await stRes.json();
    status = lastStatusPayload.status_code || lastStatusPayload.status || status;
    if (status === 'FINISHED' || status === 'ERROR' || status === 'EXPIRED') break;
  }

  if (status !== 'FINISHED') {
    const err = new Error(`Instagram media not ready (status=${status}). Try again later or check the media URL.`);
    err.status = 502;
    err.code = 'IG_PROCESSING_FAILED';
    err.detail = lastStatusPayload;
    throw err;
  }

  // 3. Publish
  const pubBody = new URLSearchParams({
    creation_id: containerId,
    access_token: accessToken
  });
  const pubRes = await fetch(`${IG_GRAPH}/v21.0/${igUserId}/media_publish`, {
    method: 'POST',
    body: pubBody
  });
  const pubData = await pubRes.json();
  if (!pubRes.ok || !pubData.id) {
    const msg = pubData.error?.message || JSON.stringify(pubData);
    const err = new Error(`Instagram publish failed: ${msg}`);
    err.status = pubRes.status || 502;
    err.code = 'IG_PUBLISH_FAILED';
    err.detail = pubData;
    throw err;
  }

  post.status = 'published';
  post.publishedAt = new Date().toISOString();
  post.publishResult = {
    provider: 'meta',
    mediaId: pubData.id,
    containerId,
    mediaUrl,
    mediaType: type
  };
  post.updatedAt = new Date().toISOString();
  await savePost(posts, post);

  await appendActivity({
    type: 'publish',
    summary: `Published to Instagram (media ${pubData.id})`,
    data: { postId, mediaId: pubData.id, provider: 'meta' }
  });

  return { ok: true, provider: 'meta', mediaId: pubData.id, post };
}

/**
 * TikTok Direct Post using PULL_FROM_URL (simplest path).
 * privacyLevel defaults to SELF_ONLY so unaudited apps still work.
 */
export async function publishToTikTok({
  postId,
  videoUrl,
  privacyLevel = 'SELF_ONLY',
  disableComment = false,
  force = false
}) {
  const { post, posts } = await getPostOrThrow(postId);

  if (!force && post.status !== 'approved' && post.status !== 'published') {
    const err = new Error('Post must be approved before publishing. Approve it in the queue first.');
    err.status = 400;
    err.code = 'NOT_APPROVED';
    throw err;
  }

  if (!videoUrl || !/^https:\/\//i.test(videoUrl)) {
    const err = new Error('A public HTTPS videoUrl is required (TikTok pulls the file). Domain may need verification in TikTok developer portal.');
    err.status = 400;
    err.code = 'VIDEO_URL_REQUIRED';
    throw err;
  }

  const accessToken = await getValidTikTokAccessToken();
  const title = (post.content || '').slice(0, 150); // TikTok title/caption limit is tight

  const allowedPrivacy = new Set([
    'PUBLIC_TO_EVERYONE',
    'MUTUAL_FOLLOW_FRIENDS',
    'FOLLOWER_OF_CREATOR',
    'SELF_ONLY'
  ]);
  const privacy = allowedPrivacy.has(privacyLevel) ? privacyLevel : 'SELF_ONLY';

  const body = {
    post_info: {
      title,
      privacy_level: privacy,
      disable_duet: false,
      disable_comment: Boolean(disableComment),
      disable_stitch: false,
      video_cover_timestamp_ms: 1000
    },
    source_info: {
      source: 'PULL_FROM_URL',
      video_url: videoUrl
    }
  };

  const initRes = await fetch(TIKTOK_INIT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8'
    },
    body: JSON.stringify(body)
  });

  const initJson = await initRes.json();
  const initData = initJson.data || initJson;

  if (!initRes.ok || initJson.error?.code && initJson.error.code !== 'ok') {
    const msg = initJson.error?.message || initJson.error_description || JSON.stringify(initJson);
    const err = new Error(`TikTok publish init failed: ${msg}`);
    err.status = initRes.status || 502;
    err.code = 'TIKTOK_INIT_FAILED';
    err.detail = initJson;
    // Common: unaudited_client_can_only_post_to_private_accounts → force SELF_ONLY
    throw err;
  }

  const publishId = initData.publish_id;

  // Optional: poll status a few times
  let statusPayload = null;
  for (let i = 0; i < 8; i++) {
    await sleep(2500);
    try {
      const stRes = await fetch(TIKTOK_STATUS, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify({ publish_id: publishId })
      });
      statusPayload = await stRes.json();
      const st = statusPayload.data?.status || statusPayload.status;
      if (st === 'PUBLISH_COMPLETE' || st === 'FAILED') break;
    } catch {
      break;
    }
  }

  post.status = 'published';
  post.publishedAt = new Date().toISOString();
  post.publishResult = {
    provider: 'tiktok',
    publishId,
    privacyLevel: privacy,
    videoUrl,
    status: statusPayload?.data || statusPayload || null
  };
  post.updatedAt = new Date().toISOString();
  await savePost(posts, post);

  await appendActivity({
    type: 'publish',
    summary: `Published to TikTok (publish_id ${publishId}, privacy ${privacy})`,
    data: { postId, publishId, provider: 'tiktok', privacy }
  });

  return {
    ok: true,
    provider: 'tiktok',
    publishId,
    privacyLevel: privacy,
    status: statusPayload,
    post
  };
}

/**
 * Resolve media: prefer explicit mediaUrl, else build public URL from local upload
 * if PUBLIC_BASE_URL is set (e.g. https://your-tunnel.ngrok.app).
 */
function resolveMediaUrl(mediaUrl, localRelativeUrl) {
  if (mediaUrl && /^https:\/\//i.test(mediaUrl)) return mediaUrl;
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (localRelativeUrl && base) {
    return `${base}${localRelativeUrl.startsWith('/') ? '' : '/'}${localRelativeUrl}`;
  }
  return mediaUrl || null;
}

/**
 * Unified entry used by the API
 * provider: meta | tiktok | youtube
 * For youtube, pass localPath (absolute) from an uploaded file.
 */
export async function publishPost({
  postId,
  provider,
  mediaUrl,
  mediaType,
  privacyLevel,
  force,
  localPath,
  title
}) {
  if (provider === 'youtube') {
    const { uploadVideoToYouTube } = await import('./publish-youtube.js');
    const { post } = await getPostOrThrow(postId);
    if (!force && post.status !== 'approved' && post.status !== 'published') {
      const err = new Error('Post must be approved before publishing.');
      err.status = 400;
      err.code = 'NOT_APPROVED';
      throw err;
    }
    const filePath = localPath || post.localMediaPath;
    if (!filePath) {
      const err = new Error('YouTube upload needs a local file. Upload a video first, then publish.');
      err.status = 400;
      err.code = 'FILE_REQUIRED';
      throw err;
    }
    const result = await uploadVideoToYouTube({
      filePath,
      title: title || post.topic || post.content?.slice(0, 80) || 'Celma upload',
      description: post.content || '',
      privacyStatus: privacyLevel === 'PUBLIC_TO_EVERYONE' || privacyLevel === 'public' ? 'public' : (privacyLevel === 'private' ? 'private' : 'unlisted'),
      postId
    });
    return { ok: true, provider: 'youtube', ...result };
  }

  // For Meta / TikTok we need a publicly reachable HTTPS URL
  const { post } = await getPostOrThrow(postId);
  const resolved = resolveMediaUrl(mediaUrl || post.mediaUrl, post.localMediaUrl);

  if (provider === 'meta' || provider === 'instagram') {
    return publishToInstagram({ postId, mediaUrl: resolved, mediaType: mediaType || post.mediaType || 'IMAGE', force });
  }
  if (provider === 'tiktok') {
    return publishToTikTok({ postId, videoUrl: resolved, privacyLevel, force });
  }
  const err = new Error(`Unsupported publish provider: ${provider}. Use meta, tiktok, or youtube.`);
  err.status = 400;
  err.code = 'UNSUPPORTED_PROVIDER';
  throw err;
}

/**
 * Auto-publish when agent mode is "auto" and the post is approved / already has media.
 * Called after approval or after generation when mode === auto.
 */
export async function maybeAutoPublish(postId) {
  const { readAgentConfig } = await import('../lib/storage.js');
  const { DEFAULT_AGENT_CONFIG } = await import('../lib/config.js');
  const config = await readAgentConfig(DEFAULT_AGENT_CONFIG);

  if (config.mode !== 'auto') {
    return { skipped: true, reason: 'Agent mode is not auto' };
  }

  const { post } = await getPostOrThrow(postId);
  if (post.status !== 'approved' && post.status !== 'published') {
    return { skipped: true, reason: 'Post not approved' };
  }

  // Prefer platform-native target from the post itself
  const platform = (post.platform || '').toLowerCase();
  let provider = null;
  if (platform.includes('tiktok')) provider = 'tiktok';
  else if (platform.includes('instagram') || platform.includes('facebook')) provider = 'meta';
  else if (platform.includes('youtube')) provider = 'youtube';

  if (!provider) {
    return { skipped: true, reason: 'No matching publish provider for platform ' + post.platform };
  }

  // Need media
  const hasRemote = post.mediaUrl && /^https:\/\//i.test(post.mediaUrl);
  const hasLocal = post.localMediaPath;
  const hasPublicBase = Boolean(process.env.PUBLIC_BASE_URL);

  if (provider === 'youtube') {
    if (!hasLocal) return { skipped: true, reason: 'YouTube auto-publish needs a local video file attached' };
  } else if (!hasRemote && !(hasLocal && hasPublicBase)) {
    return {
      skipped: true,
      reason: 'Auto-publish needs mediaUrl (https) or local upload + PUBLIC_BASE_URL for Meta/TikTok'
    };
  }

  try {
    const result = await publishPost({
      postId,
      provider,
      mediaUrl: post.mediaUrl,
      mediaType: post.mediaType || (provider === 'tiktok' ? 'REELS' : 'IMAGE'),
      privacyLevel: provider === 'tiktok' ? 'SELF_ONLY' : 'unlisted',
      localPath: post.localMediaPath,
      force: true
    });
    return { skipped: false, result };
  } catch (err) {
    await appendActivity({
      type: 'auto_publish_failed',
      summary: `Auto-publish failed: ${err.message}`,
      data: { postId, code: err.code }
    });
    return { skipped: false, error: err.message, code: err.code };
  }
}
