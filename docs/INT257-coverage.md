# INT257: Modern Web Application Development: where each topic is in `frontend-nextjs/`

The Next.js site (Next.js 16, App Router, plain JavaScript) has two parts that share one look and one login:

1. **Next.js-native pages** (server-rendered, with their own database): they carry the whole INT257 syllabus.
2. **A clone of every EchoSign React screen** (classroom, Sign Lab, Sign Meet, practice, progress, community, admin...) in `src/react-app/`. These run in the browser, exactly as in the React site, inside Next.js routing through a small adapter (`src/react-app/shims/react-router-dom.js`). They make the Next.js site look identical to the React site.

Both use the **same backend** (Render) and the same stylesheets. Study notes live in the Next.js site's **own Neon database**.

## Units

| Unit | Topic | Where |
|---|---|---|
| I | Introduction, features, project structure, App Router, development workflow | `src/app/`, `src/features/`, `src/components/`, `src/lib/`, `src/i18n/`, `src/react-app/`; scripts in `package.json` (`dev`, `build`, `start`) |
| I | File-based, dynamic and nested routes, layouts, navigation, error and loading UI | Dynamic: `(public)/dictionary/[letter]`, `(shell)/lectures/[code]`, `(shell)/notes/[id]`, `(shell)/classroom/[code]`, `(auth)/reset-password/[token]`. Layouts: `[locale]/layout.js`, `(public)/layout.js`, `(auth)/layout.js`, `(shell)/layout.js`, `(admin)/layout.js`, `overview/layout.js`. `loading.js`, `error.js`, `not-found.js`, `forbidden.js`, `global-error.js`; `next/link` and `useRouter` |
| II | SSR, SSG, ISR, client rendering, choosing a strategy | **Rendering lab** `/rendering` with one example each: `ssg`, `isr` (`revalidate = 60`), `ssr` (`dynamic = 'force-dynamic'`), `csr` (client fetch). Home and the 26 letter pages are static (`generateStaticParams`); `dictionary` is ISR (`revalidate = 86400`); `lectures`, `overview`, `notes` are SSR; the cloned EchoSign screens are client-rendered |
| II | Server and Client Components, Fetch API, client-side and server-side fetching, caching and revalidation | Server Components throughout; Client Components marked `'use client'` (`AuthForm`, `NotesBoard`, `NoteForm`, `Modal`, `ClientTime`, `src/react-app/ClientApp.js`). Server fetch in `lib/backend.js`; cached fetch with `next: { revalidate, tags }` in `languages/page.js`; on-demand refresh in `app/api/revalidate/route.js` (`revalidateTag`); `revalidatePath` in Server Actions; client fetching in the cloned screens (`src/react-app/api`) |
| III | Route Handlers, REST APIs, HTTP methods, dynamic handlers, request and response | `app/api/notes/route.js` (GET, POST), `app/api/notes/[id]/route.js` (GET, PUT, PATCH, DELETE with status codes 200, 201, 204, 401, 404, 422), plus `/api/time`, `/api/health`, `/api/vitals`, `/api/revalidate` |
| III | Server Actions, form handling, validation, data mutations, optimistic UI | `features/notes/actions.js` and `features/auth/actions.js` (`'use server'`); forms with `useActionState` and Zod errors (`NoteForm`, `AuthForm`, `RecoveryForms`); `useOptimistic` for add, pin and delete in `NotesBoard`. File upload is intentionally left out (agreed) |
| IV | Authentication, session management, protected routes, authorization, role-based access | Sign-in with email code, Google sign-in, forgot and reset password through Server Actions that call the backend and pass its httpOnly cookies on (`lib/cookies.js`); `lib/session.js` (data access layer: `getSession`, `requireSession`, `requireRole`); `proxy.js` guards every private page and renews expired logins; `(admin)/layout.js` is Admin only (`forbidden()` shows the 403 page); notes are scoped to their owner |
| IV | ORM, database connectivity, CRUD, data validation, environment variables | Prisma (`prisma/schema.prisma`, migration `0001_init`); one shared client `lib/prisma.js`; CRUD in `features/notes/data.js`; Zod in `lib/validation.js`; environment variables checked in `lib/env.js` (server-only), listed in `.env.example` |
| V | Image optimisation, Metadata API, code splitting, lazy loading, SEO | `next/image` on the home page (AVIF/WebP, lazy); `next/font` in the root layout; `generateMetadata` per page; `sitemap.js`, `robots.js`, `manifest.js`, `opengraph-image.js`; route-based code splitting is automatic, and each cloned screen is its own route chunk |
| V | Production build, environment configuration, platforms, performance monitoring, error logging | `npm run build`; `.env.example`; Vercel deployment (`DEPLOYMENT.md`); `components/WebVitals.js` + `/api/vitals`, Vercel Analytics and Speed Insights in the layout; `instrumentation.js` (`onRequestError`) and the error boundaries |
| VI | Parallel routes, proxy, intercepting routes, edge runtime, internationalization | Parallel slots `@stats` and `@recent` (each with `loading.js` and `error.js`) in `(shell)/overview`; `@modal` slot with the intercepting route `(.)lectures/[code]`; `src/proxy.js`; `/api/health` with `runtime = 'edge'` (marked deprecated by Next.js 16, shown because it is in the syllabus); languages en, hi, es under `/[locale]` with dictionaries in `src/i18n/` and the landing copy in `features/landing/copy.js` |
| VI | Architecture, component organisation, security practices, testing overview | Feature folders (`features/auth`, `notes`, `library`, `signs`, `landing`) and the `react-app` clone; security headers in `next.config.mjs`; `server-only` on secrets code; Zod on every input; ownership checks in every query; open redirects blocked in `features/auth/actions.js`. Automated tests were left out on request |

## Addresses

| Address | What it is |
|---|---|
| `/` , `/dictionary`, `/dictionary/[letter]`, `/languages`, `/rendering/*` | public Next.js pages |
| `/login`, `/register`, `/forgot-password`, `/reset-password/[token]` | Next.js sign-in pages (Server Actions) |
| `/overview`, `/lectures`, `/lectures/[code]`, `/notes`, `/notes/[id]` | signed-in Next.js pages (SSR, Prisma, parallel and intercepting routes) |
| `/classroom`, `/classroom/[code]`, `/signs`, `/meet`, `/dashboard`, `/conversation`, `/progress`, `/history`, `/leaderboard`, `/community`, `/profile`, `/library`, `/library/[code]`, `/access`, `/teacher` | cloned EchoSign screens |
| `/admin`, `/admin/users`, `/admin/sessions`, `/admin/classrooms`, `/admin/languages`, `/admin/audit` | cloned EchoSign admin screens; `/admin/notes` is the Next.js role-based-access page |

## Practicals

1. Create the app and explore the project: `frontend-nextjs/` (App Router layout, `npm run dev`)
2. File-based, nested and dynamic routing with layouts, loading and error UI: `dictionary/[letter]`, `lectures/[code]`, `loading.js`, `error.js`
3. Server-side and client-side data fetching, compare rendering strategies: `/rendering` lab and `languages`
4. Caching and revalidation: `languages/page.js`, `/api/revalidate`, `isr` page
5. REST API with Route Handlers: `/api/notes`
6. Forms with validation and data mutations in Server Actions: notes form (no file upload)
7. Database with an ORM and CRUD: Prisma `StudyNote`
8. Authentication, sessions, protected routes, role-based access: login, `proxy.js`, `(admin)/layout.js`
9. Image optimisation, metadata, code splitting, lazy loading: home page, `generateMetadata`, `sitemap.js`
10. Production build, environment, monitoring, error logging: `DEPLOYMENT.md`, `instrumentation.js`, Web Vitals

## Not built (on purpose)

- File upload (you asked to leave it out).
- Automated tests (you asked to write them only when told).
