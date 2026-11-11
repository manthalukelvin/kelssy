/**
 * YouTube Data API v3 — resumable upload helper (no googleapis dependency)
 */
import { createReadStream, statSync } from 'node:fs';
import { getValidGoogleAccessToken } from './oauth-google.js';
import { readPosts, writePosts, appendActivity } from '../lib/storage.js';

const YT_UPLOAD_INIT = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

/**
 * Upload a local video file to YouTube.
 * @param {object} opts
 * @param {string} opts.filePath - absolute path to video file
 * @param {string} opts.title
 * @param {string} [opts.description]
 * @param {'public'|'unlisted'|'private'} [opts.privacyStatus]
 * @param {string} [opts.postId] - optional Celma post to update
 */
export async function uploadVideoToYouTube({
  filePath,
  title,
  description = '',
  privacyStatus = 'unlisted',
  postId = null,
  tags = []
}) {
  if (!filePath) {
    const err = new Error('filePath is required for YouTube upload');
    err.status = 400;
    err.code = 'FILE_REQUIRED';
    throw err;
  }

  let fileSize;
  try {
    fileSize = statSync(filePath).size;
  } catch {
    const err = new Error(`Cannot read file: ${filePath}`);
    err.status = 400;
    err.code = 'FILE_NOT_FOUND';
    throw err;
  }

  const accessToken = await getValidGoogleAccessToken();

  const metadata = {
    snippet: {
      title: (title || 'Untitled').slice(0, 100),
      description: (description || '').slice(0, 5000),
      tags: Array.isArray(tags) ? tags.slice(0, 15) : []
    },
    status: {
      privacyStatus: ['public', 'unlisted', 'private'].includes(privacyStatus)
        ? privacyStatus
        : 'unlisted',
      selfDeclaredMadeForKids: false
    }
  };

  // Step 1: initiate resumable session
  const initRes = await fetch(YT_UPLOAD_INIT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(fileSize),
      'X-Upload-Content-Type': 'video/*'
    },
    body: JSON.stringify(metadata)
  });

  if (!initRes.ok) {
    const errBody = await initRes.text();
    const err = new Error(`YouTube upload session failed: ${errBody.slice(0, 400)}`);
    err.status = initRes.status;
    err.code = 'YT_SESSION_FAILED';
    throw err;
  }

  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) {
    const err = new Error('YouTube did not return a resumable upload URL');
    err.status = 502;
    err.code = 'YT_NO_UPLOAD_URL';
    throw err;
  }

  // Step 2: PUT the entire file (simple path; fine for personal-brand sizes)
  const stream = createReadStream(filePath);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'video/*',
      'Content-Length': String(buffer.length)
    },
    body: buffer
  });

  const putData = await putRes.json().catch(() => ({}));
  if (!putRes.ok || !putData.id) {
    const err = new Error(putData.error?.message || `YouTube upload failed (${putRes.status})`);
    err.status = putRes.status || 502;
    err.code = 'YT_UPLOAD_FAILED';
    err.detail = putData;
    throw err;
  }

  const result = {
    videoId: putData.id,
    title: putData.snippet?.title,
    privacyStatus: putData.status?.privacyStatus,
    url: `https://www.youtube.com/watch?v=${putData.id}`
  };

  if (postId) {
    const posts = await readPosts();
    const post = posts.find(p => p.id === postId);
    if (post) {
      post.status = 'published';
      post.publishedAt = new Date().toISOString();
      post.publishResult = {
        provider: 'youtube',
        videoId: result.videoId,
        url: result.url,
        privacyStatus: result.privacyStatus
      };
      post.updatedAt = new Date().toISOString();
      await writePosts(posts);
    }
  }

  await appendActivity({
    type: 'publish',
    summary: `Uploaded to YouTube: ${result.title} (${result.videoId})`,
    data: { videoId: result.videoId, postId, privacyStatus: result.privacyStatus }
  });

  return result;
}
