# Celma AI Agent v2.0

**Advanced personal-brand automation & growth command centre** for Facebook, TikTok, YouTube (and more).

Built for **personal use** (not multi-tenant distribution). You give the agent clear instructions; it generates content, manages an approval queue, tracks growth, learns from examples you provide, and stays ready 24/7 via scheduled ticks.

---

## Three phases completed

### Phase 1 — Foundation & security
- Modular architecture (`lib/`, `services/`, `public/`)
- Strong password protection (`.env` → session cookie)
- Gemini integration with clear error codes
- Encrypted token vault ready for OAuth
- Health + diagnostics endpoints
- Vercel-ready entrypoint + `vercel.json`

### Phase 2 — Advanced agent capabilities
- **Agent brain**: general instructions + per-action instructions
- Autonomy modes: `manual` | `semi-auto` | `auto`
- Configurable posting frequency + “run tick now”
- Content types: post, reel-script, video-script, image-prompt, carousel, thread
- Approval queue (pending → approved / rejected)
- Growth analysis + AI suggestions
- “Learn from others” (paste public posts → pattern extraction, no automatic scraping)
- Activity audit log
- Weekly plan generation

### Phase 3 — Polish & deployability
- Professional dark UI
- Clear diagnostics for easy debugging
- Ready-to-deploy package
- Honest boundaries documented (platform APIs & ToS)

---

## Quick start (local)

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Edit .env:
#   GEMINI_API_KEY=...
#   APP_PASSWORD=your-very-strong-password
#   SESSION_SECRET=long-random-string
#   TOKEN_ENCRYPTION_KEY=64-hex-chars   (optional until you use OAuth)

# Generate secrets:
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('TOKEN_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('APP_PASSWORD_HASH example — use bcrypt if preferred')"

# 3. Run
npm start
# → http://127.0.0.1:3000
```

Open the URL, enter the password you set, and you are in.

---

## Deploy on Vercel

1. Push the project to a GitHub repo (private recommended).
2. Import into Vercel.
3. Add **Environment Variables** (same as `.env`):
   - `GEMINI_API_KEY`
   - `APP_PASSWORD` (or `APP_PASSWORD_HASH`)
   - `SESSION_SECRET`
   - `TOKEN_ENCRYPTION_KEY` (recommended)
   - `NODE_ENV=production`
4. Deploy.

**Important notes for Vercel**
- The filesystem is ephemeral. JSON data files reset on cold starts / new deployments. For long-term storage, connect Vercel KV, Blob, or an external DB later.
- “24/7” behaviour is best achieved with **Vercel Cron** calling `/api/agent/run-tick` on a schedule, or by hosting the same code on a long-running platform (Railway, Render, Fly.io, a VPS).
- Always use HTTPS in production (Vercel provides it).

---

## Core features

| Feature | Description |
|---------|-------------|
| Content studio | Generate platform-native posts, scripts, image prompts from simple instructions |
| Approval queue | Review & approve before content is considered ready |
| Agent brain | Global + per-action instructions, frequency, autonomy mode |
| Growth insights | AI diagnosis + concrete next actions based on your metrics |
| Learn from others | Paste successful posts → extract patterns (compliant, no auto-scrape) |
| Activity log | Audit trail of generations, config changes, logins |
| Diagnostics | `/api/diagnose` + `npm run diagnose` for quick debugging |
| Password gate | Only people with the `.env` password can access the dashboard |

---

## Honest capability boundaries

- **YouTube, Instagram/Meta, and TikTok OAuth are all fully wired.**
  - Set the matching env vars, register the exact redirect URIs, then use **Connect** on the Connections page.
  - Tokens are stored encrypted; refresh is handled where the platform supports it.
  - Live profile / channel stats endpoints exist for all three.
- **Publishing** still depends on platform approval:
  - YouTube upload scopes work once the Google project is configured.
  - Instagram publishing scopes usually need Meta App Review.
  - TikTok Direct Post to public requires an app audit; until then content may be limited to private / SELF_ONLY.
- Aggressive auto-commenting or mass interaction bots violate platform rules and risk bans. Prefer approval-based workflows.
- “Crawling other pages” is deliberately implemented as **user-supplied text analysis** so you stay legal and compliant.

---

## Error diagnosis

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Login fails | Wrong `APP_PASSWORD` | Check `.env`, restart |
| 503 on generate | Missing / invalid Gemini key | Set `GEMINI_API_KEY` from AI Studio |
| Empty Gemini reply | Model name or quota | Check `GEMINI_MODEL`, quota |
| 401 on API calls | Session expired / not logged in | Log in again |
| Encryption errors | Bad `TOKEN_ENCRYPTION_KEY` | Must be exactly 64 hex characters |

Run:

```bash
npm run diagnose
# or open /api/diagnose while logged in
```

---

## Project structure

```
celma-ai-agent/
├── server.js              # Express app + routes
├── lib/
│   ├── config.js
│   ├── storage.js
│   ├── crypto.js
│   └── auth.js
├── services/
│   ├── gemini.js
│   └── agent.js           # Generation, growth, learning, ticks
├── public/                # Dashboard UI
├── data/                  # Runtime JSON + encrypted vault (gitignored)
├── scripts/diagnose.js
├── vercel.json
├── package.json
├── .env.example
└── README.md
```

---

## Security checklist before going online

- [ ] Strong unique `APP_PASSWORD` (or bcrypt hash)
- [ ] Long random `SESSION_SECRET`
- [ ] Valid `TOKEN_ENCRYPTION_KEY` if using connections
- [ ] Never commit `.env`
- [ ] Prefer private GitHub repo + Vercel env vars
- [ ] Understand that local JSON storage is not multi-user or highly durable on pure serverless

---

## Licence & intent

Personal / internal use by the owner of the brand. Not intended as a SaaS product for resale or multi-tenant distribution without further hardening (proper user isolation, DB, rate limits, audit, legal review, etc.).

---

**Celma AI Agent** — give it clear instructions, keep approval in the loop where it matters, and let it help you stay consistent.
