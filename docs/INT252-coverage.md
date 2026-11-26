# INT252: Web App Development with ReactJS: where each topic is in EchoSign

This maps the course syllabus (Units I to VI and the 14 practicals) to the code in `frontend-reactjs/`. Everything here is added on top of the existing app: the sign-in, classroom, captions and Sign Meet logic is unchanged. Paths below are inside `frontend-reactjs/src/` unless they start with `tests/` or a config file name.

## Project structure (feature-based)

```
src/
  features/        one folder per feature, each with pages/, components/ and hooks/ as needed
    auth/          sign-in, register, password reset, password meter, field error
    classroom/     class hub, live class room, teacher dashboard, caption panels, caption hooks
    meet/          Sign Meet page and its hooks
    signs/         Sign Lab, hand diagrams, recognition lab, sign recognition hook
    library/       My lectures, lecture notes
    practice/      Practice, AI Partner
    progress/      Progress, History, Leaderboard, segment navigation
    community/     Community chat
    account/       Profile, Roles and permissions
    admin/         admin pages and admin shell
    landing/       landing page
  components/      shared pieces: ui, AppShell, Guards, Logo, Pager, ThemeToggle, Waveform
  hooks/           shared hooks: useSpeech, useOnline, useUiPrefs, useDisplayPrefs, usePwaInstall, useRecorder
  context/         Auth and Toast providers      store/   Redux Toolkit and Zustand stores
  api/             the fetch helper and endpoints  lib/     pure logic, schemas, utilities, Axios client
```

## Units

| Unit | Topic | Where |
|---|---|---|
| I | ES6+ (arrow functions, let/const, array methods, destructuring, spread/rest, modules, immutability, shallow vs deep copy, referential equality, functional programming) | `lib/jsUtils.js` (+ `tests/jsUtils.test.js`); used by `features/progress/pages/Progress.jsx` (`groupBy`, `sum`) |
| I | SPA vs MPA, React philosophy, Vite, feature-based structure, JSX, DOM rendering, Virtual DOM | `vite.config.js`, `index.html`, `main.jsx`; the folder layout above |
| II | Reusable components, props, composition, conditional rendering, lifting state up | `components/ui/index.jsx` (`PageHeader`, `EmptyState`, `Modal`, `Tabs`), `features/auth/components/AuthLayout.jsx` wrapping forms, `features/classroom/pages/ClassroomRoom.jsx` panels |
| II | Styling: Tailwind CSS, utility-first, responsive breakpoints, reusable styling patterns, accessibility, semantic HTML | `tailwind.config.js`, `postcss.config.js`, `styles/tailwind.css`. Utilities (prefix `tw-`): the landing stats band (`md:` breakpoint), `components/Pager.jsx` (stacked on small screens, a row from the `xs` breakpoint), `features/auth/components/FieldError.jsx`, the recent-class chips. Existing CSS is kept; Tailwind's global reset is off |
| III | Events and `useState`, batching, derived state | every form and panel, for example `features/auth/pages/Auth.jsx`, `features/progress/pages/History.jsx` |
| III | `useEffect` (cleanup, dependencies), `useContext`, `useCallback`, `useMemo`, `React.memo`, custom hooks, rules of hooks | `hooks/useSpeech.js`, `features/meet/hooks/useMeet.js`, `features/classroom/hooks/useCaptionRoom.js`, `hooks/useOnline.js`; `context/AuthContext.jsx`, `ToastContext.jsx`; `useMemo` in `Progress.jsx`; `React.memo` in `features/classroom/components/CaptionStage.jsx` and `Leaderboard.jsx` |
| IV | Controlled and uncontrolled forms, submission, reusable form components | Controlled: `features/auth/pages/Auth.jsx`, `ResetPassword.jsx`. **Uncontrolled** (`FormData`, `defaultValue`): `features/auth/pages/ForgotPassword.jsx`. Reusable: `PasswordField.jsx`, `FieldError.jsx`, `PasswordMeter.jsx` |
| IV | Validation with Zod | `lib/schemas.js` (login, register, forgot, reset; same password rules as the server); `tests/schemas.test.js` |
| V | Fetch API and Axios, loading / error / empty states | **Fetch:** `api/client.js` (wrapper with refresh and retry). **Axios:** `lib/axiosClient.js` (instance, request and response interceptors, one retry after renewing the login), used for read-only requests in `Leaderboard.jsx` and `Library.jsx`. States: `EmptyState`, `LoadingState`, `ErrorState` in `components/ui` |
| V | Client state vs server state, limits of `useEffect` for data, React Query (caching, background sync) | `lib/queryClient.js`, provider in `main.jsx`; `useQuery` in `Leaderboard.jsx`, `Library.jsx`, `Progress.jsx`, `History.jsx`. With `useEffect` alone each page would refetch by hand, with no cache, no shared results and no background refresh; React Query adds all three. The cache is cleared on logout |
| V | Routing: dynamic, nested, protected, query parameters, code splitting | `App.jsx` (`:code` routes, `Outlet` layouts, `RequireAuth` / `RequireAdmin` in `components/Guards.jsx`, `React.lazy`); `useSearchParams` for `?page=` in the Library and `?tab=` in History |
| VI | Context API | `context/AuthContext.jsx`, `ToastContext.jsx` |
| VI | Redux Toolkit: slice, actions, selectors, async logic | `store/index.js`, `store/recentClassesSlice.js` (slice, selector, and `createAsyncThunk` `openClass` that checks the class exists before remembering it); used in `features/classroom/pages/ClassroomHub.jsx` |
| VI | Zustand | `store/uiStore.js`; used by `components/AppShell.jsx` (mobile menu) |
| VI | Local vs global vs server state, choosing a tool | Local: `useState` in forms. Global: Context (the signed-in person), Redux Toolkit (recent class codes), Zustand (menu open). Server: React Query (lists from the backend) |
| VI | Debugging, Profiler, build optimisation, environment variables, deployment | `<Profiler>` in `main.jsx` (logs slow renders in development); `npm run build` (code-split bundles); `import.meta.env.VITE_*` in `api/client.js`; `vercel.json` and `DEPLOYMENT.md` |

## Practicals

1. JavaScript utility functions: `lib/jsUtils.js`
2. Vite project, JSX, functional components: `package.json`, `main.jsx`
3. Reusable components with props, composition, conditional rendering: `components/ui/`
4. Responsive UI with Tailwind: landing stats band, `Pager.jsx`
5. Events and `useState` with re-render behaviour: the forms and panels throughout
6. `useEffect` with cleanup and dependencies: `hooks/useSpeech.js`, `features/meet/hooks/useMeet.js`
7. `useCallback`, `useMemo`, `React.memo`: `CaptionStage.jsx`, `Leaderboard.jsx`, `Progress.jsx`
8. Custom hook: `useMeet`, `useSpeech`, `useOnline`
9. Controlled and uncontrolled forms: `Auth.jsx` vs `ForgotPassword.jsx`
10. Zod validation with dynamic errors: `lib/schemas.js` + `FieldError.jsx`
11. Fetch / Axios with loading and error states: `api/client.js`, `lib/axiosClient.js` and the pages above
12. React Query caching and background refresh: `lib/queryClient.js` + data pages
13. Routing (dynamic, nested, protected): `App.jsx`, `components/Guards.jsx`
14. Global state (Context, Zustand, Redux Toolkit) and a deployed production build: `context/`, `store/`, `DEPLOYMENT.md`

## Two frontends, one backend

- `frontend-reactjs/` is this React app (INT252), deployed as its own Vercel project.
- `frontend-nextjs/` is the Next.js site (INT257): its own folder, its own Vercel project, the same backend on Render. See `docs/INT257-coverage.md` and "Two websites, one backend" in `DEPLOYMENT.md`.
