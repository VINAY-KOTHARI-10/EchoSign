# Deploying EchoSign

**Canonical architecture: one service.** The Express backend serves the API, the Socket.IO live-caption connection and the built React app (`frontend/dist`) from a single address. No CORS to configure, a first-party login cookie, WebSockets on the same host, and one thing to deploy. Everything below starts from that.

```
Browser ──HTTPS──▶  EchoSign service (Docker)
                      ├─ /            React app (+ service worker, manifest)
                      ├─ /api/v1/*    REST API
                      ├─ /socket.io   live captions (WebSocket, long-polling fallback)
                      └─ /health/*    liveness + readiness
                           │                │
                  Neon PostgreSQL     MongoDB Atlas
```

## What you need first

| Service | Used for | Where |
|---|---|---|
| Neon PostgreSQL | accounts, classes, captions, attendance, audit log | neon.tech: copy the **pooled** and **direct** URLs (both end `?sslmode=require`) |
| MongoDB Atlas | login sessions, one-time codes, activity feed | mongodb.com/atlas: Network Access must allow your host (`0.0.0.0/0` on Render) |
| Brevo | emails the login code, **required** (no code, no sign-in) | brevo.com: verify a sender address |
| Groq | AI notes, lecture questions, translation (optional; basic fallbacks without it) | console.groq.com |
| Google OAuth | "Continue with Google" (optional) | Google Cloud Console |

Generate each secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | yes | `production` (secure cookies, HSTS, startup checks) |
| `MONGODB_URI` | yes | MongoDB connection string |
| `DATABASE_URL` / `DIRECT_URL` | yes | Neon pooled URL (app) / direct URL (migrations) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET` | yes | signing secrets, 32+ random characters each |
| `FRONTEND_URL` | yes | the public address, `https://…`, no trailing slash (used in emails and OAuth redirects) |
| `BREVO_API_KEY`, `EMAIL_FROM` | yes in practice | login-code email |
| `GROQ_API_KEY` | optional | AI features; `GROQ_MODEL` overrides the model |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | optional | Google sign-in; callback = `<FRONTEND_URL>/api/v1/auth/google/callback` |
| `PORT` | no | the platform sets it (default 10000) |
| `TRUST_PROXY` | no | number of proxy hops (default 1; 2 when Vercel proxies to Render) |
| `ALLOWED_ORIGINS` | split deploy only | comma-separated site origins allowed to call the API |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` | no | general API limit per IP (default 1000 per 15 min) |
| `AUDIT_RETENTION_DAYS`, `CLASS_RETENTION_DAYS` | no | see `docs/DATABASE.md` |
| `DNS_SERVERS` | no | fallback DNS for `mongodb+srv` lookups |
| `LOG_LEVEL` | no | `info` by default |

In production the server **refuses to start** when a required variable is missing, and warns about short secrets, a `localhost` `FRONTEND_URL`, and optional services that are off. Never commit real values; `backend/.env` is git-ignored.

## Option A: Render (simplest, matches `render.yaml`)

1. Push the repo to GitHub.
2. Render → **New → Blueprint** → pick the repo. It creates one **Docker** web service named `echosign`, generates the three secrets, and asks for the rest.
3. Fill in the database URLs, `BREVO_API_KEY`, `EMAIL_FROM`, optional `GROQ_API_KEY` and Google keys.
4. Set `FRONTEND_URL` to the service address (for example `https://echosign.onrender.com`) and `GOOGLE_CALLBACK_URL` to `<that address>/api/v1/auth/google/callback`.
5. Deploy. On every start the container runs `prisma migrate deploy` and then the server. Health check: `/health/live`.

Use a paid plan for real classes: the free plan sleeps when idle and drops live connections. If you set the form up by hand instead of the blueprint: Language **Docker**, branch `main`, root directory empty, health check path `/health/live`.

## Option B: Docker anywhere (Railway, Fly.io, a VPS, Cloud Run)

```bash
docker build -t echosign .
docker run --env-file backend/.env -e NODE_ENV=production -p 5000:10000 echosign
# or
docker compose up --build        # http://localhost:5000, reads backend/.env
```

Put it behind HTTPS (the camera and microphone only work on HTTPS or localhost). The app trusts one proxy hop and marks cookies `Secure` in production. If you terminate TLS in nginx, forward `Upgrade` and `Connection` headers for `/socket.io`.

## Option C: plain Node

```bash
npm run install:all
npm run build          # builds frontend/dist and generates the Prisma client
npm run migrate        # prisma migrate deploy
NODE_ENV=production npm start
```

## Option D: frontend on Vercel, backend on Render (only if you must split)

The browser talks only to the Vercel address; Vercel forwards `/api/*` to Render (`frontend/vercel.json`), so the login cookie stays first-party. Only the live-caption WebSocket goes straight to Render (Vercel cannot proxy WebSockets) and it authenticates with the access token, not a cookie.

- **Render:** `NODE_ENV=production`, `TRUST_PROXY=2`, `FRONTEND_URL` and `ALLOWED_ORIGINS` = the Vercel address, `GOOGLE_CALLBACK_URL` = `https://<vercel>/api/v1/auth/google/callback`.
- **Vercel:** root directory `frontend`, build `npm run build`, output `dist`; edit `frontend/vercel.json` to your Render address; set `VITE_SOCKET_URL=https://<render address>`; do **not** set `VITE_API_URL`.

This works but is two things to keep in sync. Prefer Option A.

## After the first deploy

1. Open `https://YOUR-ADDRESS/health/ready`. It must say `ready` with both databases `up`.
2. Register, enter the emailed code, then make yourself admin: `npm --prefix backend run set-role -- you@example.com ADMIN` (run with the production `DATABASE_URL`). Admins can then make teachers from the Admin panel (Users).
3. Start a class as a teacher, join it from another device with the code, and check captions flow both ways.
4. Camera and microphone need HTTPS. Speech recognition needs Chrome or Edge.
5. Sign recognition downloads the hand-tracking model (jsdelivr.net, storage.googleapis.com) the first time. The built-in CSP allows exactly those hosts.

## Operations

- **Health:** `/health/live` (process up) for restarts, `/health/ready` (both databases) for monitors. Every response carries `X-Request-ID`; the same id is in the logs and in error bodies, so a user can quote it.
- **Logs:** structured, to the console and `backend/logs/`. Tokens, passwords, one-time codes and connection-string passwords are redacted. Plug in an error tracker (Sentry and similar) by calling it from `src/middleware/errorMiddleware.js`; none is bundled because it needs your credentials.
- **Shutdown:** on SIGTERM the server stops accepting connections, closes sockets and both databases, then exits (10 s hard limit).
- **Backups and restore:** see `docs/DATABASE.md`.
- **Maintenance:** `npm --prefix backend run maintenance -- reconcile|retention [--apply]`.
- **Updating the app on devices:** the service worker and `index.html` are never cached for long, so users get a new version on their next visit.

## Security checklist

- Never commit `.env` files. Rotate any key that was pasted into a chat, ticket or log.
- Keep `ALLOWED_ORIGINS` empty unless the frontend is on another domain.
- WebSockets must be allowed by your host or proxy.
- Terminate TLS in front of the app; set `FRONTEND_URL` to the `https://` address.
- Restrict MongoDB Atlas and Neon to the networks you need where your platform allows it.

## CI

`.github/workflows/ci.yml` runs on every push: frontend tests (recognition logic, outbox, evaluation, WCAG contrast of the colour tokens) and build, `prisma validate`, backend tests, and a Docker build. `e2e.yml` is a manual workflow that runs the end-to-end suite and the migration tests against a **test** Postgres and MongoDB you provide as repository secrets. Pushing files under `.github/workflows` needs a token with the `workflow` scope.
