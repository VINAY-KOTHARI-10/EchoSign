# EchoSign frontend

React 18 + Vite single-page app. In production it is served by the backend from `dist/`, so the site and API share one origin.

```bash
npm ci
npm run dev        # http://localhost:5173, talks to the backend on :5000
npm test           # recognition, evaluation, outbox, captions, WCAG contrast tests (node:test)
npm run build      # outputs dist/
```

## Where things are

| Path | What |
|---|---|
| `src/features` | one folder per feature (auth, classroom, meet, signs, library, practice, progress, community, account, admin, landing), each with its own pages, components and hooks |
| `src/components` | shared UI only: `ui/`, app shell and navigation, guards, logo, pager |
| `src/hooks` | shared hooks: `useSpeech`, `useUiPrefs`, `useDisplayPrefs`, `useOnline`, `usePwaInstall`, `useRecorder`; feature hooks (`useCaptionRoom`, `useSignRecognition`, `useMeet`) live in their feature |
| `src/lib` | pure logic with tests: `recognition.js` (temporal decisions), `fingerspelling.js`, `evaluation.js`, `outbox.js`, `captions.js` |
| `src/styles` | `global.css` (tokens) → `design.css` → `pages.css` → `theme.css` → `premium.css` (dark mode, glass, motion) |
| `public` | `manifest.webmanifest`, `sw.js` (service worker), `icons/` (regenerate with `node scripts/make-icons.mjs`) |
| `scripts` | `eval-signs.mjs` scores real sign recordings; `make-icons.mjs` |

## Configuration

Normally none: in production the app calls `/api/v1` on its own origin. For a split deployment set `VITE_SOCKET_URL` (see `.env.example` and `../DEPLOYMENT.md`).

## Notes for contributors

- Keep logic that can be tested out of components (put it in `src/lib`) and add a test with it.
- Colours come from CSS variables; a test checks the contrast of the main pairs in light, dark and high-contrast modes, so adjust tokens, not one-off colours.
- Anything that changes a role rule belongs in the backend's `config/permissions.js`, not in the UI.
- The service worker never caches live data (captions, chat, sockets, auth). It keeps the app shell and the lecture library and notes for offline reading, and clears them on sign out.
