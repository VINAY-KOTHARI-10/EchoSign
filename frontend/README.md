# EchoSign frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # outputs dist/
```

Set `VITE_API_URL` (default `http://localhost:5000/api/v1`) to point at the backend.

## User vs admin
- Learners: `/dashboard`, `/conversation`, `/progress`, `/history`, `/leaderboard`, `/community`, `/profile`
- Admins (`role = ADMIN`): `/admin`, `/admin/users`, `/admin/sessions`, `/admin/languages`

Make the first admin from `backend/`:

```bash
npm run make-admin -- you@example.com
```

## Classroom assistant (speech & sign → live captions)
- `/classroom` – start a class (you get a 6-character code) or join one by code / invite link.
- `/classroom/:code` – live room. The teacher (or any participant) turns on **speech to text**
  (browser Web Speech API) and/or **sign recognition** (camera + MediaPipe hand gestures, run in the
  browser; no video is uploaded). Captions stream to everyone over Socket.IO and are saved, so a
  transcript can be downloaded. Students can adjust text size, contrast theme and speaker names.
- Sign recognition has two modes: **Fingerspell A–Z** (ASL letters build a word that is sent after a pause)
  and **Phrase gestures** (7 hand shapes mapped to classroom phrases, see `src/lib/signGestures.js`).
- Letters are recognised by a rule-based classifier in `src/lib/fingerspelling.js` (`npm test` runs its
  tests on synthetic hands). A, E, M, N, S, T look alike in 2D and are the least reliable; J and Z are
  detected from a motion path. Verify accuracy on real camera input before relying on it in class.
- Students can also type a caption or tap a quick phrase.
- Sign recognition loads its runtime from jsDelivr and its model from `storage.googleapis.com` on
  first use, so it needs internet access. Chrome or Edge is recommended for speech recognition.

## Classroom toolkit
**Accessibility:** caption translation (Groq), font / line / letter spacing options (Lexend, Atkinson
Hyperlegible), reading-pace control (words per minute), colour themes, name / question / keyword alerts
(screen flash + vibration), raise-hand queue.
**Teaching:** AI lecture summary (notes, key terms, quiz), searchable transcript with jump-to-caption,
export to TXT / SRT / PDF (print), keyword highlights, caption corrections (teacher, captioner or speaker),
local audio recording with subtitles synced to it.
**Sign:** Sign lab (`/signs`): alphabet dictionary with diagrams, camera practice mode, text-to-sign;
teachers can record custom class gestures.
**Management:** attendance, teacher insights, captioner role, scheduled start time, reopen a class to keep
one recurring code.

The AI features use Groq. The model is set in `backend/src/utils/groq.js` (override with `GROQ_MODEL`).

## Roles
Administrator > Teacher > Member.
- **Member** (default for new accounts): joins classes with a code, practises, uses the Sign Lab.
- **Teacher**: everything a member can do, plus starts and hosts classes (captions, hand-raise queue, summaries, attendance).
- **Administrator**: everything a teacher can do, plus the admin panel (users, roles, sessions, classrooms, languages).

Admins change roles on the Users page of the admin panel, or from the command line in backend/:

    npm run set-role -- user@example.com TEACHER
