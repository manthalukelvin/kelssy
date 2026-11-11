/**
 * Exact-time scheduling for posts (local JSON schedule)
 * A cron / tick checks due items and can auto-publish when mode allows.
 */
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../lib/config.js';
import { readPosts, writePosts, appendActivity } from '../lib/storage.js';

const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');

async function readSchedule() {
  try {
    const raw = await readFile(SCHEDULE_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeSchedule(items) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(SCHEDULE_FILE, JSON.stringify(items, null, 2), { mode: 0o600 });
}

/**
 * Schedule a post for a specific ISO datetime
 */
export async function schedulePost({ postId, runAt, provider, mediaUrl, privacyLevel }) {
  if (!postId || !runAt) {
    const err = new Error('postId and runAt (ISO datetime) are required');
    err.status = 400;
    err.code = 'BAD_SCHEDULE';
    throw err;
  }
  const when = new Date(runAt);
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) {
    const err = new Error('runAt must be a valid future (or near-future) ISO datetime');
    err.status = 400;
    err.code = 'BAD_SCHEDULE_TIME';
    throw err;
  }

  const posts = await readPosts();
  const post = posts.find(p => p.id === postId);
  if (!post) {
    const err = new Error('Post not found');
    err.status = 404;
    throw err;
  }

  const item = {
    id: randomUUID(),
    postId,
    runAt: when.toISOString(),
    provider: provider || null,
    mediaUrl: mediaUrl || post.mediaUrl || null,
    privacyLevel: privacyLevel || 'SELF_ONLY',
    status: 'scheduled',
    createdAt: new Date().toISOString()
  };

  const items = await readSchedule();
  items.push(item);
  items.sort((a, b) => a.runAt.localeCompare(b.runAt));
  await writeSchedule(items);

  post.scheduledFor = item.runAt;
  post.scheduleId = item.id;
  post.updatedAt = new Date().toISOString();
  await writePosts(posts);

  await appendActivity({
    type: 'schedule',
    summary: `Scheduled post ${postId} for ${item.runAt}`,
    data: { scheduleId: item.id, provider: item.provider }
  });

  return item;
}

export async function listSchedule() {
  return readSchedule();
}

export async function cancelSchedule(scheduleId) {
  const items = await readSchedule();
  const next = items.filter(i => i.id !== scheduleId);
  await writeSchedule(next);
  return { ok: true, remaining: next.length };
}

/**
 * Process due schedule items. Called by cron tick.
 */
export async function processDueSchedule({ limit = 5 } = {}) {
  const items = await readSchedule();
  const now = Date.now();
  const due = items.filter(i => i.status === 'scheduled' && new Date(i.runAt).getTime() <= now).slice(0, limit);
  if (!due.length) return { processed: 0, results: [] };

  const { publishPost } = await import('./publish.js');
  const results = [];

  for (const item of due) {
    try {
      // Ensure post is approved
      const posts = await readPosts();
      const post = posts.find(p => p.id === item.postId);
      if (!post) {
        item.status = 'failed';
        item.error = 'Post missing';
        results.push({ id: item.id, ok: false, error: 'Post missing' });
        continue;
      }
      if (post.status !== 'approved' && post.status !== 'published') {
        post.status = 'approved';
        post.updatedAt = new Date().toISOString();
        await writePosts(posts);
      }

      if (!item.provider) {
        item.status = 'skipped';
        item.error = 'No provider set on schedule item';
        results.push({ id: item.id, ok: false, error: item.error });
        continue;
      }

      const result = await publishPost({
        postId: item.postId,
        provider: item.provider,
        mediaUrl: item.mediaUrl || post.mediaUrl,
        mediaType: post.mediaType || 'IMAGE',
        privacyLevel: item.privacyLevel,
        localPath: post.localMediaPath,
        force: true
      });
      item.status = 'done';
      item.completedAt = new Date().toISOString();
      item.result = { provider: result.provider, mediaId: result.mediaId || result.videoId || result.publishId };
      results.push({ id: item.id, ok: true, result: item.result });
    } catch (err) {
      item.status = 'failed';
      item.error = err.message;
      item.completedAt = new Date().toISOString();
      results.push({ id: item.id, ok: false, error: err.message });
    }
  }

  await writeSchedule(items);
  await appendActivity({
    type: 'schedule_tick',
    summary: `Processed ${results.length} scheduled item(s)`,
    data: { results }
  });

  return { processed: results.length, results };
}
