/**
 * Local media uploads — store under data/uploads and optionally expose via /uploads/
 */
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from '../lib/config.js';

export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

const ALLOWED_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.mp4', '.mov', '.webm', '.m4v'
]);

export async function ensureUploadsDir() {
  await mkdir(UPLOADS_DIR, { recursive: true });
}

/**
 * Save a buffer to uploads folder.
 * Returns { id, filename, path, relativeUrl, mime, size }
 */
export async function saveUpload({ buffer, originalName, mime }) {
  await ensureUploadsDir();
  const ext = path.extname(originalName || '').toLowerCase() || guessExt(mime);
  if (!ALLOWED_EXT.has(ext)) {
    const err = new Error(`File type not allowed (${ext}). Allowed: images and common video formats.`);
    err.status = 400;
    err.code = 'BAD_FILE_TYPE';
    throw err;
  }
  const id = randomUUID();
  const filename = `${id}${ext}`;
  const filePath = path.join(UPLOADS_DIR, filename);
  await writeFile(filePath, buffer, { mode: 0o600 });
  return {
    id,
    filename,
    path: filePath,
    relativeUrl: `/uploads/${filename}`,
    mime: mime || 'application/octet-stream',
    size: buffer.length,
    originalName: originalName || filename
  };
}

export async function deleteUpload(filename) {
  const safe = path.basename(filename);
  try {
    await unlink(path.join(UPLOADS_DIR, safe));
  } catch { /* ignore */ }
}

function guessExt(mime = '') {
  if (mime.includes('jpeg')) return '.jpg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('quicktime')) return '.mov';
  if (mime.includes('webm')) return '.webm';
  return '.bin';
}
