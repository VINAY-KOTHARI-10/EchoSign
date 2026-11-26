# 🌊 EchoSign: Sign Language & Speech-to-Text Classroom Assistant

> An accessibility platform for classrooms that converts speech and supported sign-language gestures into real-time text captions, helping deaf and hard-of-hearing students follow lectures.

A student can join a class with a code, follow the lecture through live captions, answer by typing or signing, recover from a dropped connection without losing anything, and come back later to the full transcript, lecture notes, a quiz, and a question-answering assistant grounded in what the teacher actually said.

**Deploying?** See [DEPLOYMENT.md](DEPLOYMENT.md). **Database design:** [docs/DATABASE.md](docs/DATABASE.md).

---

## What it does (and what it does not)

| Area | What you get |
|---|---|
| **Live captions** | Speech, recognised sign, and typed captions share one system: every caption has a database id, an idempotency key, a speaker taken from the login (never from the client), a source and a timestamp. Captions appear in order, are stored once even when a send is retried, and can be corrected by the host or a captioner (the original text is kept). |
| **Speech to text** | The browser's Web Speech API (Chrome / Edge). Interim text is broadcast as a draft but **never stored**; only final sentences become captions. Where speech is unsupported, students can type. *Chrome and Edge send microphone audio to Google / Microsoft to be transcribed; EchoSign only receives the words.* |
| **Sign to text** | MediaPipe hand tracking **in the browser** (no video leaves the device). ASL fingerspelling A–Z (J and Z need a motion) plus a small set of phrase gestures and teacher-recorded class gestures. A letter is accepted only when it is stable over about half a second, confident, and not ambiguous; uncertain shapes are never forced into a caption. It is **not** a full sign-language translator. |
| **Reliability** | Automatic reconnection, token refresh, class re-join, catch-up of missed captions, an outbox that retries unsent captions (over the socket, or HTTP when the socket is down), connection status and an offline banner. |
| **Transcript** | Complete, cursor-paginated transcript with keyword, speaker and source filters, jump-to-time, and TXT / SRT / print-to-PDF export. No fixed cap. |
| **AI notes and quiz** | Long lectures are read in chunks and combined; output is validated; a clearly labelled non-AI fallback is used when the AI service is down. Notes record how they were made. |
| **Ask your lecture** | Students ask questions; answers come only from the stored transcript and notes, with timestamped references. If the lecture did not cover it, the answer says so. |
| **Translation** | Batched, cached, de-duplicated; failures are reported (never faked) and can be retried. The original transcript is always kept. |
| **Roles** | Admin, Teacher, Student with a single permission table, role-based menus, a 403 page, a roles & permissions page, and an audit log. |
| **Dashboards** | Teacher: classes, attendance, captions by source, lecture time, saved summaries, topics. Admin: users, roles, classes, online now, service status. Student: "My lectures" library. All numbers come from real records. |
| **Attendance** | Counted per *person* (two devices count once), with first join, last departure, reconnection count and total time (saved every minute, so a restart loses at most one). |
| **Installable (PWA)** | App shell, install prompt, online/offline indicator, and offline reading of saved lecture notes. Live classes need a connection and say so. |
| **Accessibility** | Light, dark and high-contrast themes; font size, family (including Lexend and Atkinson Hyperlegible), line and letter spacing; reduced motion; keyboard navigation; screen-reader labels and optional caption announcements; flash and vibration alerts. |
| **Text to sign** | Shows the ASL fingerspelling hand shape for each letter of a word. It does not translate into sign language. |

---

## Tech stack

- **Frontend:** React 18, Vite, React Router, Lucide, plain CSS design system (`frontend-reactjs/src/styles`). A second frontend, `frontend-nextjs/`, uses Next.js and the same backend.
- **Backend:** Node.js, Express, Socket.IO, JWT with rotating refresh tokens, Google OAuth, Brevo email, Groq AI.
- **Data:** PostgreSQL via Prisma is the source of truth for accounts, classes, **captions, chat, attendance, practice sessions** and the audit log. MongoDB via Mongoose holds login sessions, one-time codes, pronunciation attempt records and the practice activity feed.
- **Sign recognition:** MediaPipe tasks-vision plus a rule-based fingerspelling classifier.
- **Deployment:** one Docker image, Render blueprint, Docker Compose, GitHub Actions.

One deployable service: the Express server serves the API, the Socket.IO connection and the built React app from a single address.

## Project structure

```
echosign/
├── backend/
│   ├── prisma/              schema + migrations (additive only; never edit an applied migration)
│   ├── src/
│   │   ├── app.js           Express app: security headers, CORS/CSRF, health, routes, static frontend
│   │   ├── server.js        startup, env validation, graceful shutdown
│   │   ├── config/          permissions.js (the role table), cors, env, databases, chat rooms
│   │   ├── controllers/     auth, classrooms (captions, transcript, export, notes, ask, dashboards), sessions...
│   │   ├── sockets/         socketManager.js, presenceRegistry.js (per-person attendance)
│   │   ├── utils/           lectureAi.js (hierarchical summary, Q&A), captionPages.js (cursor paging), transcriptStream.js, translation.js, profileSync.js, jwtHelper, stats...
│   │   ├── routes/v1/       REST routes
│   │   └── Services/        email (Brevo), audit log
│   ├── tests/               Jest: auth, permissions, presence, AI logic, exports, env, redaction
│   ├── e2e/                 end-to-end suite (real server, sockets and databases)
│   └── scripts/             run-e2e, test-migrations, maintenance, set-role, make-admin
├── frontend-reactjs/
│   ├── src/                 features/ (one folder per feature with its pages, components, hooks), shared components and hooks, lib (pure, tested logic: outbox*, signSession, speechSession, translation*)
│   ├── public/              manifest, service worker, icons
│   ├── tests/               node:test: recognition, evaluation, outbox (IndexedDB), camera/speech lifecycle, translation, contrast (accessibility), captions
│   └── scripts/             make-icons, eval-signs (evaluation report from real recordings)
├── frontend-nextjs/         Next.js site for INT257 (App Router, JavaScript, Prisma): see its README
├── docs/                    DATABASE.md, Postman collection
├── Dockerfile  docker-compose.yml  render.yaml  .github/workflows/
└── DEPLOYMENT.md
```

## Run it locally

You need Node 18+, a PostgreSQL database (Neon works well) and a MongoDB database (Atlas free tier).

```bash
cp backend/.env.example backend/.env      # fill in the database URLs and three secrets
npm run install:all
cd backend && npx prisma migrate deploy && cd ..
npm run live                              # builds the frontend and serves everything at http://localhost:5000
```

For development with hot reload: `npm run dev:backend` and `npm run dev:frontend` (Vite on :5173).

Make yourself an admin (register first), then change roles from the Admin panel:

```bash
npm --prefix backend run set-role -- you@example.com ADMIN
```

### Environment variables

Full list with comments: [backend/.env.example](backend/.env.example). Required in production: `MONGODB_URI`, `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET`, `FRONTEND_URL`. Without `BREVO_API_KEY` + `EMAIL_FROM` nobody can verify an account; without `GROQ_API_KEY` notes, questions and translation fall back to basic behaviour or report that they are unavailable. The server refuses to start in production when a required value is missing.

## Roles and permissions

All rules live in one table, `backend/src/config/permissions.js`. The backend checks it; the frontend reads it from `GET /api/v1/users/permissions`; the **Roles & permissions** page (`/access`) shows it. Inside a class, separate roles apply, kept in a second table in the same file (`CLASS_PERMISSIONS`): Host (the teacher who started the class, or any admin), Captioner (a trusted student: may correct anyone's caption, generate notes and see insights, but cannot change settings, end the class or give roles) and Student (may correct only their own captions). The HTTP controllers and the Socket.IO layer both ask `canInClass()` / `classRoleFor()` from that file, and `backend/tests/permissions.test.js` fails if a controller asks about a permission that does not exist or re-implements the host rule. A real captioner, an outsider teacher and an admin are exercised end to end in `e2e/echosign.e2e.js` ("roles inside a class").A class code is an invitation: reading a class's captions, notes or translations needs membership, and wrong codes are rate limited.

## Sign Meet (extra feature)

Video meetings for signers and speakers, at `/meet` (Sign Meet in the menu). Up to four people; one person starts a meeting and shares its six-character code.

- **Direct video.** Video and audio travel straight between the devices (WebRTC). The server only introduces people and passes connection messages (`backend/src/sockets/meetManager.js`); nothing is recorded or stored. On a phone hotspot or shared Wi-Fi the video stays on that network. EchoSign itself (sign-in, database) still needs the hotspot's data connection, unless you run your own copy.
- **Subtitles for everyone.** Sign recognition runs in each browser (MediaPipe): fingerspelled letters become words, and twelve phrase signs (Hello, Help, Thank you, Yes, No, Please, Sorry, Stop, Pain, Peace, I love you, Superb) become sentences, using a small random-forest model exported to `frontend-reactjs/public/models/phrase-signs.json`. Optional speech-to-text and typed messages share the same subtitle stream. The camera picture is never uploaded. Recognition can be wrong, and the phrase model's accuracy has not been measured; the page says so.
- **Hand tracking files** are served by this app (`frontend-reactjs/public/models/hand_landmarker.task`, and the WebAssembly files copied from the installed package by `frontend-reactjs/scripts/copy-mediapipe.mjs` before dev and build), with the public CDN as a fallback.
- **Your own copy on the local network:** `npm --prefix backend run lan` creates a self-signed certificate (browsers only allow the camera on https), builds the app if needed, and prints the addresses to open on every device. Each device shows a certificate warning once, which is expected on a private network. The certificate lives in `backend/certs` and is never committed.
- **Across the internet** needs STUN/TURN servers: set `WEBRTC_ICE_SERVERS` to a JSON array. The default is none, so nothing contacts a third party.
- Some hotspots block devices from reaching each other ("client isolation"); then people cannot see each other. Try another hotspot or the same Wi-Fi.

## Honest fallbacks, schedules and languages

- **No invented scores.** When the AI is unavailable, Practice shows a plainly labelled *word match only* (which of the phrase's words were heard), with no fluency, intonation or stress numbers, and it is **never saved** to progress, history or the leaderboard. The AI Partner answers "unavailable" instead of a canned reply with a random score. The AI-backed paths still work normally when a key is configured.
- **Scheduled classes are enforced by the server.** Before a class's start time, students and captioners are refused (`NOT_STARTED`) on the live join and on the caption fallback; the host and admins can enter early.
- **One language list.** The server serves the built-in twelve languages adjusted by the Languages admin page (add one and it appears in every picker, in the profile and in translation; switch one off and it disappears). The frontend loads it at start (`lib/languages.js`) and falls back to the built-in list if the request fails.
- **Role changes are confirmed and immediate.** Changing an account role asks first and explains what the role can do. HTTP requests already read the role fresh on every call; sockets that are already open are updated at once, so a demoted admin stops acting as a class host.

## Security highlights

- Short-lived access tokens (header only), refresh-token rotation with reuse detection, logout on this device or all devices, rate-limited login and one-time codes.
- CSP written for what the app loads, camera/microphone allowed for our own pages, `Permissions-Policy`, request ids, sanitised error messages, secret redaction in logs, 512 KB body limit.
- Cookies are `HttpOnly`, `Secure` in production; state-changing requests from other sites are refused (Origin check).
- Sockets: authenticated, token re-checked as it expires, membership checked on every class event, payloads validated and size-limited, per-user rate limits, no joining arbitrary rooms.
- An email failure is reported to the person, never shown as success.

### Install note

The root `package.json` has no dependencies of its own (it only forwards scripts), so there is no root lockfile. `npm run install:all` runs `npm ci` in `frontend-reactjs/` and `backend/`, each of which has its own `package-lock.json`.

## How the live features behave when things go wrong

- **Captions never get lost or doubled.** Every caption has a `clientId`. It is saved in **IndexedDB** (per person and class) before it is sent, sent over the socket or, if the socket is down, over HTTP with the *same* id, and removed only when the server confirms it (or says it already had it). After a refresh, crash or reconnect the saved captions load first and are sent once. Temporary errors (network, 5xx, 429, not joined yet) retry with a back-off of 1.5 s to 10 s. A caption the server refuses for good (class ended, not allowed, invalid) is shown with **Retry** and **Discard**, never retried silently. Nothing is sent before there is a valid sign-in, and a 401 renews the sign-in once. If the browser cannot store data (private mode, blocked, out of space) captions still send from memory and the screen says they would be lost if the page were closed.
  *Retention:* unsent or refused captions are kept for **48 hours**, at most **500** per person per class on disk, and are **deleted when that person signs out**. They are only ever read by the same person in the same class. The service worker never caches or touches them. Two tabs of the same class can both retry the same caption; the server de-duplicates by `clientId`.
- **Translation** is tracked per caption and per language (not requested / pending / done / failed / retrying). Successes are kept when others fail, failures retry with a bounded back-off and a manual **Retry**, an edited caption is translated again, and changing class or language starts clean. An untranslated caption is never shown as if it were a translation.
- **Camera and microphone** start-up is cancellable: pressing Stop (or leaving the page) while the browser is asking for permission or the hand model is loading releases the camera and starts nothing. Changing the spoken language restarts exactly one recognizer, and an old recognizer finishing late cannot restart anything.
- **Long lectures** are processed a page at a time with no length limit (see [docs/DATABASE.md](docs/DATABASE.md)). Summaries and answers say how much of the lecture the AI actually read.

## React course coverage (INT252) and the second frontend

The React frontend also shows the topics of the INT252 syllabus: Tailwind CSS (utilities prefixed `tw-`, no global reset), Zod form validation (`frontend-reactjs/src/lib/schemas.js`), React Query for server data, Redux Toolkit and Zustand stores (`frontend-reactjs/src/store/`), controlled and uncontrolled forms, `React.memo`, `useSearchParams`, a Profiler, and a set of ES6 utilities. They were added without changing how sign-in, classes, captions or Sign Meet work. The topic-by-topic map is in [docs/INT252-coverage.md](docs/INT252-coverage.md).

A second frontend (Next.js, for INT257) is **planned but not created yet**. It will sit in its own folder, be deployed as its own Vercel project, and use the same Render backend. The backend is already prepared: see "Two websites, one backend" in [DEPLOYMENT.md](DEPLOYMENT.md).

## Testing

```bash
npm test                           # frontend tests + backend Jest (databases mocked)
npm --prefix backend run e2e       # end-to-end: real server, sockets, Postgres and MongoDB (throwaway schema + database)
npm --prefix backend run test:migrations   # migrations on a clean database and on a populated one
```

`e2e` and `test:migrations` create and then drop their own schema/database and never touch your real tables. Frontend tests include the temporal recognition logic, the evaluation maths, the caption outbox, and **WCAG contrast checks of the real colour tokens in all four themes**.

### Measuring sign recognition honestly

Synthetic hands only prove the logic is self-consistent. To measure real performance: open **Sign Lab → Recognition test**, record consented samples (landmark numbers only, no video) across different people, lighting, cameras, backgrounds and distances, export them, then

```bash
cd frontend-reactjs && node scripts/eval-signs.mjs samples-p1.json samples-p2.json --out report.md
```

This produces accuracy, precision, recall, a confusion matrix, rejection rate and per-letter results, re-scoring the same recordings with the current classifier so improvements can be measured repeatably. No accuracy figure is published in this repository, because none has been measured on enough real people yet.

### Manual checks (things automation cannot prove)

1. **Translation retry:** open a class, choose a translation language, turn off the network, say or type a line: it shows "could not be translated" and then retries by itself; press Retry after reconnecting.
2. **Session deletion statistics:** on Practice, finish two or three sessions, note the totals on the dashboard, delete one, and confirm sessions, minutes and average match the remaining rows.
3. **Long lecture:** create a class with more than 20,000 captions (the e2e suite does this against a throwaway database), then export TXT/SRT, generate the summary and ask a question about something said near the end.
4. **Stop during camera start:** in Sign Lab press Start and immediately Stop while the browser permission prompt or the "loading hand tracking" message is showing: the camera light must go out and stay out.
5. **Speech language switching:** while captioning, change the spoken language twice quickly; you should get one continuous recognizer, no duplicated lines.
6. **Offline, refresh, reconnect:** while in a class, go offline, send three captions, refresh the page, go online: all three arrive once each, in order.

## Known limitations

- Speech recognition depends on Chrome or Edge and an internet connection; accuracy varies with accent, noise and microphone.
- Sign recognition covers ASL fingerspelling and a few gestures. J and Z need a motion; A, E, M, N, S, T look alike and are held longer before they are accepted. Lighting, camera quality and hand position matter.
- Camera and speech start-up logic, the IndexedDB outbox and the long-lecture code are covered by automated tests against test doubles; the browser-specific parts (real camera permission prompts, Chrome's speech service, other browsers' IndexedDB quotas) still need the manual checks below.
- AI notes can contain mistakes; they are labelled as AI-generated and the original transcript is always available.
- Free hosting tiers sleep when idle; a live class should use an always-on plan.
- Socket.IO runs in one process. Scaling to several instances needs a Redis adapter (not added, because one instance serves a classroom well).

## License

For educational use. Add a license before publishing publicly.
