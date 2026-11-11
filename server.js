import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PORT, IS_PROD, BRANDS, PLATFORMS, OBJECTIVES, CONTENT_TYPES } from './lib/config.js';
import { requireAuth, verifyPassword, createSessionCookie, clearSessionCookie, getSessionFromRequest } from './lib/auth.js';
import { readPosts, writePosts, readActivityLog, appendActivity, readConnections, writeConnections } from './lib/storage.js';
import { isGeminiConfigured } from './services/gemini.js';
import * as agent from './services/agent.js';
import * as googleOAuth from './services/oauth-google.js';
import * as metaOAuth from './services/oauth-meta.js';
import * as tiktokOAuth from './services/oauth-tiktok.js';
import * as publish from './services/publish.js';
import { saveUpload, UPLOADS_DIR, ensureUploadsDir } from './services/uploads.js';
import * as schedule from './services/schedule.js';
import { suggestReplies } from './services/comments.js';
import { generateImageFromPrompt } from './services/images.js';
import multer from 'multer';
import { signSession } from './lib/crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));

app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());
app.use('/api/', rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false
}));

// ---------- Auth routes (public) ----------
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'Celma AI Agent',
    version: '2.0.0',
    geminiConfigured: isGeminiConfigured(),
    storage: 'local-json + encrypted vault',
    auth: 'password-protected',
    automation: 'semi-auto with approval queue'
  });
});

app.get('/api/auth/status', (req, res) => {
  const session = getSessionFromRequest(req);
  res.json({ authenticated: Boolean(session), role: session?.role || null });
});

app.post('/api/auth/login', async (req, res) => {
  const password = String(req.body?.password || '');
  if (!password) return res.status(400).json({ error: 'Password required' });

  const ok = await verifyPassword(password);
  if (!ok) {
    await appendActivity({ type: 'auth_fail', summary: 'Failed login attempt' }).catch(() => {});
    return res.status(401).json({ error: 'Invalid password', code: 'BAD_PASSWORD' });
  }

  createSessionCookie(res, { role: 'owner', at: Date.now() });
  await appendActivity({ type: 'auth_ok', summary: 'Successful login' });
  res.json({ ok: true, message: 'Authenticated' });
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// All routes below require authentication
app.use(requireAuth);

// ---------- Agent config ----------
app.get('/api/agent/config', async (_req, res, next) => {
  try {
    const config = await agent.getAgentConfig();
    res.json({ config });
  } catch (err) { next(err); }
});

app.put('/api/agent/config', async (req, res, next) => {
  try {
    const allowed = ['mode', 'approvalRequired', 'postingFrequency', 'platformsEnabled', 'generalInstructions', 'actionInstructions', 'customCron'];
    const partial = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) partial[k] = req.body[k];
    }
    const config = await agent.updateAgentConfig(partial);
    res.json({ config });
  } catch (err) { next(err); }
});

// ---------- Content generation ----------
app.post('/api/generate', async (req, res, next) => {
  try {
    const {
      brand = 'Personal Brand',
      platform,
      objective = 'Engagement',
      topic,
      tone,
      contentType = 'post',
      audience,
      extra
    } = req.body || {};

    if (!platform || !topic) {
      return res.status(400).json({ error: 'platform and topic are required' });
    }
    if (!PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: `platform must be one of: ${PLATFORMS.join(', ')}` });
    }

    const post = await agent.generateContent({
      brand, platform, objective, topic, tone, contentType, audience, extra
    });
    res.json({ post });
  } catch (err) { next(err); }
});

// ---------- Posts CRUD + approval ----------
app.get('/api/posts', async (_req, res, next) => {
  try {
    const posts = await readPosts();
    res.json({ posts: posts.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')) });
  } catch (err) { next(err); }
});

app.patch('/api/posts/:id', async (req, res, next) => {
  try {
    const posts = await readPosts();
    const idx = posts.findIndex(p => p.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Post not found' });

    const { status, content, metrics, mediaUrl, mediaType, localMediaPath, localMediaUrl } = req.body || {};
    const allowedStatus = new Set(['draft', 'pending_approval', 'approved', 'published', 'rejected', 'archived']);
    const becameApproved = status === 'approved' && posts[idx].status !== 'approved';

    if (status) {
      if (!allowedStatus.has(status)) return res.status(400).json({ error: 'Invalid status' });
      posts[idx].status = status;
    }
    if (typeof content === 'string') {
      posts[idx].content = content.trim().slice(0, 15000);
    }
    if (typeof mediaUrl === 'string') posts[idx].mediaUrl = mediaUrl.trim();
    if (typeof mediaType === 'string') posts[idx].mediaType = mediaType;
    if (typeof localMediaPath === 'string') posts[idx].localMediaPath = localMediaPath;
    if (typeof localMediaUrl === 'string') posts[idx].localMediaUrl = localMediaUrl;

    if (metrics && typeof metrics === 'object') {
      const keys = ['reach', 'views', 'likes', 'comments', 'shares', 'clicks', 'signups'];
      const clean = {};
      for (const k of keys) {
        if (metrics[k] !== undefined) {
          const n = Number(metrics[k]);
          if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: `Invalid metric: ${k}` });
          clean[k] = Math.floor(n);
        }
      }
      posts[idx].metrics = { ...posts[idx].metrics, ...clean, updatedAt: new Date().toISOString(), source: 'manual' };
    }

    posts[idx].updatedAt = new Date().toISOString();
    await writePosts(posts);
    await appendActivity({ type: 'post_update', summary: `Updated post ${posts[idx].id}`, data: { status: posts[idx].status } });

    let autoPublish = null;
    if (becameApproved) {
      autoPublish = await publish.maybeAutoPublish(posts[idx].id);
    }

    res.json({ post: posts[idx], autoPublish });
  } catch (err) { next(err); }
});

app.delete('/api/posts/:id', async (req, res, next) => {
  try {
    const posts = await readPosts();
    const remaining = posts.filter(p => p.id !== req.params.id);
    if (remaining.length === posts.length) return res.status(404).json({ error: 'Post not found' });
    await writePosts(remaining);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------- Growth & learning ----------
app.post('/api/agent/analyse-growth', async (req, res, next) => {
  try {
    const result = await agent.analyseGrowth(req.body?.brand || '');
    res.json(result);
  } catch (err) { next(err); }
});

app.post('/api/agent/learn', async (req, res, next) => {
  try {
    const postsText = String(req.body?.postsText || '').trim();
    if (postsText.length < 40) return res.status(400).json({ error: 'Provide enough text from other posts (min ~40 chars)' });
    const result = await agent.learnFromPosts({ postsText, goal: req.body?.goal });
    res.json(result);
  } catch (err) { next(err); }
});

app.post('/api/agent/weekly-plan', async (req, res, next) => {
  try {
    const plan = await agent.createWeeklyPlan(req.body || {});
    res.json({ plan });
  } catch (err) { next(err); }
});

app.post('/api/agent/run-tick', async (req, res, next) => {
  try {
    const result = await agent.runAgentTick({ force: Boolean(req.body?.force) });
    res.json(result);
  } catch (err) { next(err); }
});

// ---------- Activity log ----------
app.get('/api/activity', async (_req, res, next) => {
  try {
    const log = await readActivityLog();
    res.json({ log: log.slice(0, 100) });
  } catch (err) { next(err); }
});

// ---------- Connections & OAuth (Google + Meta + TikTok) ----------
function oauthSuccessPage(title, accountName) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${title}</title>
<style>
  body{font:16px system-ui;background:#0b0d17;color:#eef0ff;display:grid;place-items:center;min-height:100vh;margin:0}
  .card{background:#161a33;border:1px solid #252a4a;border-radius:16px;padding:32px;max-width:420px;text-align:center}
  a{color:#a9a4ff} h1{font-size:1.3rem;margin:0 0 8px} p{color:#9aa3c7;margin:0 0 16px}
</style></head>
<body><div class="card">
  <h1>${title}</h1>
  <p>Account <strong>${accountName || 'connected'}</strong> is now linked to Celma AI Agent. Tokens are stored encrypted.</p>
  <p><a href="/">Return to dashboard</a></p>
  <script>setTimeout(()=>location.href='/',2500)</script>
</div></body></html>`;
}

function oauthErrorPage(msg) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Connection failed</title>
<style>body{font:16px system-ui;background:#0b0d17;color:#eef0ff;display:grid;place-items:center;min-height:100vh;margin:0}
.card{background:#161a33;border:1px solid #252a4a;border-radius:16px;padding:32px;max-width:480px}
a{color:#a9a4ff}</style></head>
<body><div class="card"><h1>Connection failed</h1><p>${msg}</p>
<p><a href="/">Back to dashboard</a></p></div></body></html>`;
}

app.get('/api/connections', async (_req, res, next) => {
  try {
    const saved = await readConnections();
    const safe = {};
    for (const [k, v] of Object.entries(saved)) {
      safe[k] = {
        connected: true,
        provider: k,
        connectedAt: v.connectedAt || null,
        expiresAt: v.expiresAt || null,
        accountName: v.accountName || v.extra?.name || null,
        email: v.email || null,
        channel: v.channel || null,
        picture: v.picture || null,
        extra: v.extra || null
      };
    }
    res.json({
      connections: safe,
      googleConfigured: googleOAuth.isGoogleConfigured(),
      metaConfigured: metaOAuth.isMetaConfigured(),
      tiktokConfigured: tiktokOAuth.isTikTokConfigured()
    });
  } catch (err) { next(err); }
});

app.get('/api/oauth/:provider/start', (req, res, next) => {
  const provider = req.params.provider;
  try {
    if (provider === 'google') {
      const { url } = googleOAuth.startGoogleOAuth();
      return res.redirect(url);
    }
    if (provider === 'meta') {
      const { url } = metaOAuth.startMetaOAuth();
      return res.redirect(url);
    }
    if (provider === 'tiktok') {
      const { url } = tiktokOAuth.startTikTokOAuth();
      return res.redirect(url);
    }
    return res.status(404).json({ error: 'Unsupported provider' });
  } catch (err) { next(err); }
});

app.get('/api/oauth/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    const record = await googleOAuth.handleGoogleCallback({
      code: String(code || ''),
      state: String(state || ''),
      error: error ? String(error) : null
    });
    res.status(200).send(oauthSuccessPage('YouTube connected', record.accountName));
  } catch (err) {
    res.status(err.status || 500).send(oauthErrorPage(err.message || 'OAuth failed'));
  }
});

app.get('/api/oauth/meta/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    const record = await metaOAuth.handleMetaCallback({
      code: String(code || ''),
      state: String(state || ''),
      error: error ? String(error) : null
    });
    res.status(200).send(oauthSuccessPage('Instagram / Meta connected', record.accountName));
  } catch (err) {
    res.status(err.status || 500).send(oauthErrorPage(err.message || 'OAuth failed'));
  }
});

app.get('/api/oauth/tiktok/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;
    const record = await tiktokOAuth.handleTikTokCallback({
      code: String(code || ''),
      state: String(state || ''),
      error: error ? String(error) : null,
      error_description: error_description ? String(error_description) : null
    });
    res.status(200).send(oauthSuccessPage('TikTok connected', record.accountName));
  } catch (err) {
    res.status(err.status || 500).send(oauthErrorPage(err.message || 'OAuth failed'));
  }
});

app.post('/api/connections/:provider/disconnect', async (req, res, next) => {
  try {
    const provider = req.params.provider;
    if (!['google', 'meta', 'tiktok'].includes(provider)) {
      return res.status(404).json({ error: 'Unknown provider' });
    }
    const saved = await readConnections();
    delete saved[provider];
    await writeConnections(saved);
    await appendActivity({ type: 'disconnect', summary: `Disconnected ${provider}` });
    res.json({ ok: true, provider });
  } catch (err) { next(err); }
});

app.get('/api/youtube/stats', async (_req, res, next) => {
  try {
    const stats = await googleOAuth.fetchYouTubeChannelStats();
    res.json(stats);
  } catch (err) { next(err); }
});

app.get('/api/meta/profile', async (_req, res, next) => {
  try {
    const profile = await metaOAuth.fetchMetaProfile();
    res.json(profile);
  } catch (err) { next(err); }
});

app.get('/api/tiktok/profile', async (_req, res, next) => {
  try {
    const profile = await tiktokOAuth.fetchTikTokProfile();
    res.json(profile);
  } catch (err) { next(err); }
});

/**
 * Publish an approved post to Meta, TikTok, or YouTube.
 * Body: {
 *   provider: 'meta'|'tiktok'|'youtube',
 *   mediaUrl?: 'https://...',
 *   mediaType?: 'IMAGE'|'REELS',
 *   privacyLevel?: 'SELF_ONLY'|'unlisted'|...,
 *   localPath?: absolute path from /api/upload
 * }
 */
app.post('/api/publish/:postId', async (req, res, next) => {
  try {
    const postId = req.params.postId;
    const {
      provider,
      mediaUrl,
      mediaType = 'IMAGE',
      privacyLevel = 'SELF_ONLY',
      force = false,
      localPath,
      title
    } = req.body || {};

    if (!provider || !['meta', 'instagram', 'tiktok', 'youtube'].includes(provider)) {
      return res.status(400).json({ error: 'provider must be meta, tiktok, or youtube' });
    }

    const result = await publish.publishPost({
      postId,
      provider,
      mediaUrl,
      mediaType,
      privacyLevel,
      force: Boolean(force),
      localPath,
      title
    });
    res.json(result);
  } catch (err) { next(err); }
});

// ---------- Local file upload ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 } // 200 MB
});

app.post('/api/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Use multipart field name "file".' });
    }
    const saved = await saveUpload({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mime: req.file.mimetype
    });

    // Optionally attach to a post
    const postId = req.body?.postId;
    if (postId) {
      const posts = await readPosts();
      const idx = posts.findIndex(p => p.id === postId);
      if (idx >= 0) {
        posts[idx].localMediaPath = saved.path;
        posts[idx].localMediaUrl = saved.relativeUrl;
        posts[idx].mediaType = (req.file.mimetype || '').startsWith('video') ? 'REELS' : 'IMAGE';
        posts[idx].updatedAt = new Date().toISOString();
        await writePosts(posts);
      }
    }

    res.json({
      ok: true,
      upload: saved,
      note: 'For Instagram/TikTok, set PUBLIC_BASE_URL to a public HTTPS origin that can serve /uploads/… (e.g. ngrok). YouTube can use the local path directly.'
    });
  } catch (err) { next(err); }
});

// Serve uploaded media (auth not required so platforms / ngrok can pull; filenames are UUIDs)
ensureUploadsDir().catch(() => {});
app.use('/uploads', express.static(UPLOADS_DIR, { fallthrough: false, maxAge: '1h' }));

// ---------- Schedule (exact times) ----------
app.get('/api/schedule', async (_req, res, next) => {
  try {
    const items = await schedule.listSchedule();
    res.json({ schedule: items });
  } catch (err) { next(err); }
});

app.post('/api/schedule', async (req, res, next) => {
  try {
    const item = await schedule.schedulePost(req.body || {});
    res.json({ item });
  } catch (err) { next(err); }
});

app.delete('/api/schedule/:id', async (req, res, next) => {
  try {
    const result = await schedule.cancelSchedule(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

// ---------- Comment reply suggestions ----------
app.post('/api/comments/suggest', async (req, res, next) => {
  try {
    const result = await suggestReplies(req.body || {});
    res.json(result);
  } catch (err) { next(err); }
});

// ---------- Image generation from prompt ----------
app.post('/api/images/generate', async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    const postId = req.body?.postId || null;
    if (prompt.length < 8) {
      return res.status(400).json({ error: 'prompt is required (min ~8 chars)' });
    }
    const result = await generateImageFromPrompt(prompt, { postId });

    // Attach to post if requested
    if (postId && result.path) {
      const posts = await readPosts();
      const idx = posts.findIndex(p => p.id === postId);
      if (idx >= 0) {
        posts[idx].localMediaPath = result.path;
        posts[idx].localMediaUrl = result.relativeUrl;
        posts[idx].mediaType = 'IMAGE';
        posts[idx].updatedAt = new Date().toISOString();
        await writePosts(posts);
      }
    }
    res.json(result);
  } catch (err) { next(err); }
});

// ---------- Cron / 24-7 tick (protect with CRON_SECRET if set) ----------
app.post('/api/cron/tick', async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const hdr = req.headers['x-cron-secret'] || req.query.secret;
      if (hdr !== secret) {
        return res.status(401).json({ error: 'Invalid cron secret' });
      }
    }
    // 1) Process due scheduled posts
    const due = await schedule.processDueSchedule({ limit: 5 });
    // 2) Optional agent content tick
    const force = Boolean(req.body?.force || req.query.force);
    const tick = await agent.runAgentTick({ force });
    res.json({ ok: true, schedule: due, agentTick: tick, at: new Date().toISOString() });
  } catch (err) { next(err); }
});

// Also allow GET for simple cron providers
app.get('/api/cron/tick', async (req, res, next) => {
  req.body = {};
  // reuse POST handler logic via internal call pattern
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const hdr = req.headers['x-cron-secret'] || req.query.secret;
      if (hdr !== secret) {
        return res.status(401).json({ error: 'Invalid cron secret' });
      }
    }
    const due = await schedule.processDueSchedule({ limit: 5 });
    const tick = await agent.runAgentTick({ force: req.query.force === '1' });
    res.json({ ok: true, schedule: due, agentTick: tick, at: new Date().toISOString() });
  } catch (err) { next(err); }
});

// ---------- Diagnostics ----------
app.get('/api/diagnose', async (_req, res) => {
  const checks = [];

  checks.push({
    name: 'Gemini API key',
    ok: isGeminiConfigured(),
    detail: isGeminiConfigured() ? 'Present' : 'Missing GEMINI_API_KEY'
  });

  checks.push({
    name: 'App password',
    ok: Boolean(process.env.APP_PASSWORD || process.env.APP_PASSWORD_HASH),
    detail: process.env.APP_PASSWORD_HASH ? 'Using bcrypt hash' : (process.env.APP_PASSWORD ? 'Plain password set' : 'Not set')
  });

  checks.push({
    name: 'Session secret',
    ok: Boolean(process.env.SESSION_SECRET) && process.env.SESSION_SECRET.length >= 16,
    detail: process.env.SESSION_SECRET ? `Length ${process.env.SESSION_SECRET.length}` : 'Missing or too short'
  });

  let encryptionOk = false;
  let encryptionDetail = 'Not set';
  try {
    if (process.env.TOKEN_ENCRYPTION_KEY && /^[a-f0-9]{64}$/i.test(process.env.TOKEN_ENCRYPTION_KEY)) {
      encryptionOk = true;
      encryptionDetail = 'Valid 64-hex key';
    } else {
      encryptionDetail = 'Must be 64 hex characters';
    }
  } catch (e) {
    encryptionDetail = e.message;
  }
  checks.push({ name: 'Token encryption key', ok: encryptionOk, detail: encryptionDetail });

  checks.push({
    name: 'Node version',
    ok: true,
    detail: process.version
  });

  checks.push({
    name: 'Google / YouTube OAuth',
    ok: googleOAuth.isGoogleConfigured(),
    detail: googleOAuth.isGoogleConfigured()
      ? 'GOOGLE_CLIENT_ID + SECRET present'
      : 'Optional — set GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET'
  });
  checks.push({
    name: 'Meta / Instagram OAuth',
    ok: metaOAuth.isMetaConfigured(),
    detail: metaOAuth.isMetaConfigured()
      ? 'META_APP_ID + SECRET present'
      : 'Optional — set META_APP_ID & META_APP_SECRET'
  });
  checks.push({
    name: 'TikTok OAuth',
    ok: tiktokOAuth.isTikTokConfigured(),
    detail: tiktokOAuth.isTikTokConfigured()
      ? 'TIKTOK_CLIENT_KEY + SECRET present'
      : 'Optional — set TIKTOK_CLIENT_KEY & TIKTOK_CLIENT_SECRET'
  });

  const allOk = checks.every(c => c.ok);
  res.json({
    ok: allOk,
    service: 'Celma AI Agent',
    timestamp: new Date().toISOString(),
    checks,
    advice: allOk
      ? 'Core configuration looks healthy.'
      : 'Fix the failed checks above. Run `npm run diagnose` for a fuller report.'
  });
});

// ---------- Meta ----------
app.get('/api/meta', (_req, res) => {
  res.json({
    brands: BRANDS,
    platforms: PLATFORMS,
    objectives: OBJECTIVES,
    contentTypes: CONTENT_TYPES
  });
});

// Static frontend
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// Catch-all for SPA-style
app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler with diagnosis-friendly payload
app.use((err, _req, res, _next) => {
  console.error('[Celma]', err?.code || err?.name || 'Error', err?.message);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Unexpected server error',
    code: err.code || 'INTERNAL',
    diagnosis: err.diagnosis || null
  });
});

// Start
if (process.env.NODE_ENV !== 'test' && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`\n  Celma AI Agent v2.0`);
    console.log(`  → http://127.0.0.1:${PORT}`);
    console.log(`  Gemini: ${isGeminiConfigured() ? 'configured' : 'NOT configured'}`);
    console.log(`  Auth: password protected\n`);
  });
}
