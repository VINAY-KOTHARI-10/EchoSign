# Deploying EchoSign

EchoSign ships as **one service**: the Express backend serves the API, the Socket.IO server and the built React app (`frontend/dist`) from a single address. That means no CORS setup and a first-party login cookie.

```
echosign/
├── backend/            Express API + Socket.IO + Prisma (Postgres) + Mongoose (MongoDB)
│   ├── prisma/         schema and migrations (commit these; deploys run `prisma migrate deploy`)
│   ├── src/            app.js, server.js, controllers, routes, sockets
│   └── .env.example    every setting, with placeholders
├── frontend/           React + Vite (built into frontend/dist)
├── Dockerfile          multi-stage image: build React, install backend, run
├── docker-compose.yml  one-container local/prod run
├── render.yaml         Render blueprint (no Docker needed)
├── package.json        root scripts: build, start, migrate, test
└── .github/workflows/  CI: frontend tests + build, prisma validate, docker build
```

## What you need first
| Service | Used for | Where to get it |
|---|---|---|
| Neon Postgres | accounts, classrooms | neon.tech (copy the **pooled** and **direct** URLs) |
| MongoDB Atlas | captions, chat, practice records | mongodb.com/atlas (allow your host's IPs, or 0.0.0.0/0) |
| Groq | AI features | console.groq.com |
| Brevo | login verification emails | brevo.com (verify a sender address) |
| Google OAuth (optional) | "Continue with Google" | Google Cloud Console |

## Option A: Render (simplest)
1. Push the repo to GitHub.
2. Render → **New → Blueprint** → pick the repo. `render.yaml` creates the service and generates the JWT/session secrets.
3. Paste the secret values it asks for (`MONGODB_URI`, `DATABASE_URL`, `DIRECT_URL`, `GROQ_API_KEY`, `BREVO_API_KEY`, `EMAIL_FROM`, Google keys).
4. Set `FRONTEND_URL` to the service address (for example `https://echosign.onrender.com`) and `GOOGLE_CALLBACK_URL` to `<that address>/api/v1/auth/google/callback`.
5. Deploy. The build runs the frontend build and `prisma migrate deploy`; the health check is `/health`.

## Option B: Docker (any host: Railway, Fly.io, a VPS, Cloud Run)
```bash
docker build -t echosign .
docker run --env-file backend/.env -e NODE_ENV=production -p 5000:10000 echosign
```
or `docker compose up --build`. The container runs `prisma migrate deploy` and then starts the server on `$PORT` (default 10000). Put it behind HTTPS; the app trusts one proxy hop and sets secure cookies in production.

## Option C: plain Node server
```bash
npm --prefix frontend ci && npm --prefix backend ci
npm run build          # builds frontend/dist and generates the Prisma client
npm run migrate        # applies database migrations
NODE_ENV=production npm start
```

## Option D: frontend on Vercel, backend on Render
The browser only ever talks to the Vercel address. Vercel forwards `/api/*` to Render (`frontend/vercel.json`), so the login cookie is first-party and works in Safari, Brave and strict privacy modes. Only the live-caption WebSocket goes straight to Render, and it authenticates with the access token, not a cookie.

**Render (backend)**
- Deploy as in Option A. Set `NODE_ENV=production` and `TRUST_PROXY=2` (Vercel + Render are two proxy hops, so rate limits see the real visitor).
- `FRONTEND_URL=https://YOUR-APP.vercel.app` and `ALLOWED_ORIGINS=https://YOUR-APP.vercel.app` (the second one lets the WebSocket connect).
- `GOOGLE_CALLBACK_URL=https://YOUR-APP.vercel.app/api/v1/auth/google/callback`: use the **Vercel** address, and add the same URL in Google Cloud Console. This keeps the Google login cookie on one site.

**Vercel (frontend)**
- Import the repo, set **Root Directory** to `frontend` (build `npm run build`, output `dist`).
- Edit `frontend/vercel.json` and replace `YOUR-API.onrender.com` with your Render address.
- Add the environment variable `VITE_SOCKET_URL=https://YOUR-API.onrender.com`. Do **not** set `VITE_API_URL`.

After Google sign-in users land on `/classroom`.

## Required environment variables
`MONGODB_URI`, `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET`, `GROQ_API_KEY`, `FRONTEND_URL`, `BREVO_API_KEY`, `EMAIL_FROM`. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_CALLBACK_URL` to enable Google sign-in. Full list: `backend/.env.example`.

## After the first deploy
1. Open the site and register. **Make yourself admin:** `npm --prefix backend run set-role -- you@example.com ADMIN` (run it on the host, or locally with production `DATABASE_URL`). Admins can then make teachers in the Admin panel.
2. Check `https://YOUR-DOMAIN/health` returns OK.
3. Camera and microphone only work on **HTTPS** (or localhost). Speech recognition needs Chrome or Edge.
4. Sign recognition downloads the hand-tracking model in the browser, so allow `cdn.jsdelivr.net` and `storage.googleapis.com` if you run a strict content policy.

## Security checklist
- Never commit `.env`. Rotate any key that was ever pasted into chat or a ticket (Groq, MongoDB password, Neon URL, Google secret).
- Use long random values for the three secrets (command in `.env.example`).
- Keep `ALLOWED_ORIGINS` empty unless the frontend is on another domain.
- WebSockets must be allowed by your host or proxy (Render and Fly allow them by default; on nginx add the `Upgrade` headers).
- Free tiers sleep when idle; the first request after a pause is slow and live classes drop their socket.
