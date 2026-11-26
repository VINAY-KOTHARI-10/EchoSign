# EchoSign Next (INT257)

A companion site for EchoSign built with Next.js 16 (App Router, plain JavaScript). It shows a sign-language dictionary, the signed-in person's lecture notes (from the EchoSign backend) and their own study notes (saved in this site's own database). It looks like the EchoSign React site because it uses the same stylesheets.

Topic-by-topic map of the course syllabus: [`../docs/INT257-coverage.md`](../docs/INT257-coverage.md).

## Run it locally

```powershell
cd frontend-nextjs
copy .env.example .env.local      # then edit the values
npm install
npx prisma migrate deploy         # creates the study_notes table in your NEW Neon project
npm run dev                       # http://localhost:3000
```

Pages that do not need the database or the backend (home, sign dictionary, rendering lab, languages with its built-in fallback) work without them. Sign-in needs the EchoSign backend running at `BACKEND_URL`; notes need `DATABASE_URL`.

## Environment variables

On Vercel only two are needed.

| Name | Needed? | What it is |
|---|---|---|
| `BACKEND_URL` | yes | The EchoSign backend (Render), no trailing slash. Server-only |
| `DATABASE_URL` | yes | Pooled address of the new Neon project |
| `DIRECT_URL` | migrations only | Direct address of the same project. Used from your computer by `prisma migrate deploy`; not needed on Vercel |
| `NEXT_PUBLIC_SITE_URL` | optional | This site's public address. Found automatically on Vercel; set only for a custom domain |
| `REVALIDATE_SECRET` | optional | Secret for `POST /api/revalidate`. Without it that address is switched off |

## How it fits together

- The browser talks only to this site. `next.config.mjs` forwards `/api/v1/*` to the backend, so login cookies stay on this site and Google sign-in can return here.
- Server code (Server Components, Server Actions, Route Handlers) calls the backend with the person's access token. `src/proxy.js` renews an expired login before the page renders.
- Study notes live in this site's own Postgres database through Prisma. Each note belongs to the EchoSign user id from the backend login.

## Deploying

See "Two websites, one backend" in [`../DEPLOYMENT.md`](../DEPLOYMENT.md): create a second Vercel project from this repository with *Root Directory* `frontend-nextjs`, set the two required variables above, and list this site's address in the backend's `FRONTEND_URLS`.
