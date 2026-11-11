import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './config.js';
import { encryptJson, decryptJson } from './crypto.js';

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readJson(file, fallback) {
  try {
    const raw = await readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(file, data) {
  await ensureDataDir();
  await writeFile(file, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// ---------- Posts ----------
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
export async function readPosts() {
  const data = await readJson(POSTS_FILE, []);
  return Array.isArray(data) ? data : [];
}
export async function writePosts(posts) {
  await writeJson(POSTS_FILE, posts);
}

// ---------- Plans ----------
const PLANS_FILE = path.join(DATA_DIR, 'weekly-plans.json');
export async function readPlans() {
  const data = await readJson(PLANS_FILE, []);
  return Array.isArray(data) ? data : [];
}
export async function writePlans(plans) {
  await writeJson(PLANS_FILE, plans);
}

// ---------- Agent config ----------
const AGENT_FILE = path.join(DATA_DIR, 'agent-config.json');
export async function readAgentConfig(defaults) {
  return await readJson(AGENT_FILE, defaults);
}
export async function writeAgentConfig(config) {
  await writeJson(AGENT_FILE, { ...config, updatedAt: new Date().toISOString() });
}

// ---------- Activity / audit log ----------
const LOG_FILE = path.join(DATA_DIR, 'activity-log.json');
export async function readActivityLog() {
  const data = await readJson(LOG_FILE, []);
  return Array.isArray(data) ? data : [];
}
export async function appendActivity(entry) {
  const log = await readActivityLog();
  log.unshift({
    id: entry.id || randomUUID(),
    at: new Date().toISOString(),
    ...entry
  });
  // keep last 500 entries
  await writeJson(LOG_FILE, log.slice(0, 500));
}

// ---------- Connections (encrypted) ----------
const CONNECTIONS_FILE = path.join(DATA_DIR, 'connections.enc');
export async function readConnections() {
  try {
    await access(CONNECTIONS_FILE);
    const payload = JSON.parse(await readFile(CONNECTIONS_FILE, 'utf8'));
    return decryptJson(payload);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}
export async function writeConnections(obj) {
  await ensureDataDir();
  const encrypted = encryptJson(obj);
  await writeFile(CONNECTIONS_FILE, JSON.stringify(encrypted), { mode: 0o600 });
}

// ---------- Growth snapshots ----------
const GROWTH_FILE = path.join(DATA_DIR, 'growth.json');
export async function readGrowth() {
  return await readJson(GROWTH_FILE, { snapshots: [], suggestions: [] });
}
export async function writeGrowth(data) {
  await writeJson(GROWTH_FILE, data);
}
