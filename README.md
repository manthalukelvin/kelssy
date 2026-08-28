# Seshter 79 — Music Streaming & Download Platform

**Domain:** https://music.myjournalplus.com

Modern, production-oriented music platform built with:

- **Next.js 15** (App Router)
- **Prisma** + PostgreSQL
- **NextAuth.js** (credentials + role-based access)
- **Tailwind CSS** (dark, premium UI)
- Designed for Cloudflare R2 / S3 storage

This starter already includes:

- Complete Prisma schema (songs, artists, albums, genres, playlists, favorites, history, news, analytics events, roles…)
- Public layout + dark design system
- Persistent player shell
- Auth (register / login)
- Protected Admin dashboard skeleton
- Seed script for Super Admin + genres

---

## Step-by-step: How to build & run

### 1. Prerequisites

- Node.js 18+ (recommended 20+)
- PostgreSQL database (local or managed: Neon, Supabase, Railway, etc.)
- (Optional) Cloudflare R2 or AWS S3 bucket for audio + covers

### 2. Install

```bash
# Unzip the project
cd seshter79-starter

# Install dependencies
npm install
```

### 3. Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/seshter79?schema=public"
NEXTAUTH_SECRET="generate-a-long-random-string"   # openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="Seshter 79"
```

### 4. Database

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database (dev)
npx prisma db push

# Seed Super Admin + genres
npx tsx prisma/seed.ts
```

Default Super Admin (change after first login):

- Email: `admin@seshter79.com`
- Password: `ChangeMe123!`

You can override with:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=YourStrongPass npx tsx prisma/seed.ts
```

### 5. Run locally

```bash
npm run dev
```

Open:

- Public site → http://localhost:3000
- Admin → http://localhost:3000/admin (sign in with Super Admin)

### 6. Build for production

```bash
npm run build
npm start
```

### 7. Deploy to production (music.myjournalplus.com)

Recommended stack:

| Service        | Suggestion                  |
|----------------|-----------------------------|
| Frontend/API   | Vercel                      |
| Database       | Neon / Supabase / Railway   |
| Audio + images | Cloudflare R2 (or S3)       |
| Domain         | music.myjournalplus.com     |

**Vercel steps:**

1. Push repo to GitHub
2. Import project in Vercel
3. Add all environment variables (especially `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL=https://music.myjournalplus.com`)
4. Set domain: `music.myjournalplus.com`
5. Deploy

After deploy:

```bash
# On production (or via Vercel CLI / one-off job)
npx prisma db push
npx tsx prisma/seed.ts
```

### 8. Storage setup (audio & covers)

1. Create R2 bucket (or S3)
2. Make a public access policy or use signed URLs
3. Add credentials to `.env`
4. Implement upload API (Stage 5) that stores files and saves the public/signed URL in `Song.audioUrl` / `coverImage`

**Never** put private storage keys in the frontend.

### 9. Next development stages (follow in order)

| Stage | What to build                                      | Status in this starter |
|-------|----------------------------------------------------|------------------------|
| 1     | Core UI + navigation                               | ✅ Done                |
| 2     | Authentication                                     | ✅ Done                |
| 3     | Database architecture                              | ✅ Done                |
| 4     | Admin dashboard shell                              | ✅ Done                |
| 5     | Music upload system (admin)                        | Next                   |
| 6     | Streaming + persistent player                      | Next                   |
| 7     | Downloads                                          |                        |
| 8     | Search                                             |                        |
| 9     | Artist / Album / Genre pages                       |                        |
| 10    | Playlists & Favorites                              |                        |
| 11    | News                                               |                        |
| 12    | Analytics                                          |                        |
| 13    | SEO + PWA                                          |                        |
| 14    | Security & performance hardening                   |                        |
| 15    | Production deployment checklist                    |                        |

### 10. Creating the first administrator (manual alternative)

If you prefer not to use the seed script:

```sql
-- After hashing a password with bcrypt (cost 12)
INSERT INTO users (id, email, "passwordHash", name, role, "createdAt", "updatedAt")
VALUES (
  'clxxxxxxxx',
  'admin@example.com',
  '$2a$12$....your-hash....',
  'Admin',
  'SUPER_ADMIN',
  NOW(),
  NOW()
);
```

Or use Prisma Studio:

```bash
npx prisma studio
```

### 11. Troubleshooting

| Problem                        | Fix |
|--------------------------------|-----|
| `PrismaClientInitializationError` | Check `DATABASE_URL` and that the DB is reachable |
| NextAuth “NO_SECRET”           | Set `NEXTAUTH_SECRET` |
| Admin redirects to login       | User role must be SUPER_ADMIN / CONTENT_MANAGER / EDITOR / ANALYST |
| Images not loading             | Add your storage domain to `next.config.ts` → `images.remotePatterns` |
| Large audio upload fails       | Increase body size limit (already set to 50mb in next.config) + check storage provider limits |

### 12. Security reminders

- Never commit `.env`
- Validate all uploads on the server (mime type + size)
- Use signed URLs for private audio when needed
- Enforce roles in API routes and Server Actions, not only in the UI
- Rate-limit auth and upload endpoints in production

---

## Project structure (key folders)

```
seshter79-starter/
├── prisma/
│   ├── schema.prisma      # Full database schema
│   └── seed.ts            # Super Admin + genres
├── src/
│   ├── app/
│   │   ├── (public pages)
│   │   ├── admin/         # Protected admin area
│   │   ├── api/           # Auth + future APIs
│   │   ├── login/
│   │   └── register/
│   ├── components/
│   │   ├── layout/        # Header, Footer, MobileNav
│   │   └── player/        # Persistent player
│   ├── lib/
│   │   ├── auth.ts
│   │   ├── prisma.ts
│   │   └── utils.ts
│   └── types/
├── .env.example
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

---

## Brand

- Name: **Seshter 79**
- Domain: **music.myjournalplus.com**
- Visual: Dark modern, blue/purple accents, glassmorphism, large artwork, mobile-first

Continue building stage by stage. When you are ready for Stage 5 (upload system) or Stage 6 (real player + streaming), just ask and we will implement the next layer.
