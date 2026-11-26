import { useCallback, useEffect, useRef, useState } from 'react';
import {
  COOLDOWN_MS, GESTURE_MODEL, HOLD_FRAMES, MEDIAPIPE_WASM, MIN_SCORE, gestureById,
} from '../../../lib/signGestures';
import { classifyLetter, classifyPath } from '../../../lib/fingerspelling';
import { handVector, matchCustomGesture } from '../../../lib/customGestures';
import { VoteWindow } from '../../../lib/recognition';
import { createSignController, loadGestureEngine } from '../../../lib/signSession.js';

const LETTER_REPEAT_MS = 1400;   // holding the same shape this long types it again (e.g. "LL")
const PATH_WINDOW_MS = 1500;     // motion history used for J and Z
const SHAPE_MEMORY_MS = 700;     // J/Z motion may start a moment after the I / D shape was made
const REPLACE_WINDOW_MS = 3000;  // J/Z replaces the I / D that was typed while the hand was still

// Camera + MediaPipe hand recognition, entirely in the browser (no video leaves the device).
//   mode 'phrases' → onGesture(gesture) once per held gesture (the class's custom gestures are checked first)
//   mode 'letters' → onLetter({ letter, replacePrevious }) once per accepted ASL letter
// Letters are decided over a short window of frames (see lib/recognition.js), not from a single frame, and an
// ambiguous or low-confidence shape is never typed.
// status: idle | loading | running | error.  hand: 'none' | 'detected'.
export default function useSignRecognition({ mode = 'phrases', onGesture, onLetter, customGestures } = {}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [hand, setHand] = useState('none');
  const [current, setCurrent] = useState(null); // gesture, or { letter, confidence } / { unsure: [a, b] } for letters
  const [progress, setProgress] = useState(0);  // 0..1 toward being accepted

  const modeRef = useRef(mode);
  const onGestureRef = useRef(onGesture);
  const onLetterRef = useRef(onLetter);
  const customRef = useRef(customGestures);
  const vectorRef = useRef(null); // hand shape of the current frame (null when no hand), for recording gestures
  const pointsRef = useRef(null); // the 21 landmarks in pixels (null when no hand), for the recognition test
  const rejectRef = useRef(() => {});
  modeRef.current = mode;
  onGestureRef.current = onGesture;
  onLetterRef.current = onLetter;
  customRef.current = customGestures;

  // The per-frame recognition loop for one session. Returns a function that stops it (and only it).
  const runFrames = (engine) => {
    let alive = true; let raf = 0;
    // per-session recognition state
    let heldId = null; let heldCount = 0; let lastFired = { id: null, at: 0 }; let lastVideoTime = -1;
    let path = []; let shape = { letter: null, at: 0 }; let lastTyped = { letter: null, at: 0 };
    const votes = new VoteWindow();
    let shown = ''; let shownProgress = -1; let handShown = 'none';
    const show = (cur, prog) => {
      const key = cur ? `${cur.letter || cur.id || ''}|${(cur.unsure || []).join('')}|${cur.confidence ?? ''}` : '';
      if (key !== shown) { shown = key; setCurrent(cur); }
      const p = Math.round(prog * 20) / 20;
      if (p !== shownProgress) { shownProgress = p; setProgress(p); }
    };
    const reset = () => { heldId = null; heldCount = 0; votes.clear(); show(null, 0); };
    rejectRef.current = () => { votes.clear(); lastFired = { id: null, at: performance.now() }; show(null, 0); }; // "that was wrong, try again"

    // Accept `id` once it has been held for `need` consecutive frames (used for phrase gestures).
    const hold = (id, need, repeatMs, payload) => {
      if (id === heldId) heldCount += 1; else { heldId = id; heldCount = 1; }
      show(payload, Math.min(1, heldCount / need));
      const cooling = lastFired.id === id && performance.now() - lastFired.at < repeatMs;
      if (heldCount >= need && !cooling) { lastFired = { id, at: performance.now() }; heldCount = 0; return true; }
      return false;
    };

    const loop = () => {
      if (!alive) return;
      const v = videoRef.current; const canvas = canvasRef.current;
      if (v && v.readyState >= 2 && v.currentTime !== lastVideoTime) {
        lastVideoTime = v.currentTime;
        const now = performance.now();
        let result;
        try { result = engine.recognizer.recognizeForVideo(v, now); } catch (err) { alive = false; ctrlRef.current.fail(err); return; } // e.g. the model was closed
        const lm = result.landmarks?.[0];
        const handNow = lm ? 'detected' : 'none';
        if (handNow !== handShown) { handShown = handNow; setHand(handNow); }

        if (canvas) {
          canvas.width = v.videoWidth; canvas.height = v.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const draw = new engine.vision.DrawingUtils(ctx);
          result.landmarks.forEach((points) => {
            draw.drawConnectors(points, engine.vision.GestureRecognizer.HAND_CONNECTIONS, { color: '#a78bfa', lineWidth: 4 });
            draw.drawLandmarks(points, { color: '#ffffff', fillColor: '#6c3ce9', radius: 4 });
          });
        }

        vectorRef.current = null; pointsRef.current = null;
        if (!lm) {
          reset(); path = [];
          if (lastFired.id && now - lastFired.at > 600) lastFired = { id: null, at: 0 };
        } else if (modeRef.current === 'letters') {
          // Landmarks are normalised 0..1; scale to pixels so the hand is not stretched by the aspect ratio.
          const px = lm.map((p) => ({ x: p.x * v.videoWidth, y: p.y * v.videoHeight }));
          pointsRef.current = px;
          const scale = Math.hypot(px[0].x - px[9].x, px[0].y - px[9].y);
          path.push({ x: px[8].x, y: px[8].y, px20: px[20], t: now });
          path = path.filter((p) => now - p.t <= PATH_WINDOW_MS);

          const found = classifyLetter(px);
          if (found && (found.letter === 'I' || found.letter === 'D')) shape = { letter: found.letter, at: now };

          // J (from I) and Z (from D) are drawn in the air
          const kind = shape.letter === 'I' ? 'J' : shape.letter === 'D' ? 'Z' : null;
          if (kind && now - shape.at < SHAPE_MEMORY_MS) {
            const pts = path.map((p) => (kind === 'J' ? { x: p.px20.x, y: p.px20.y, t: p.t } : p));
            const motion = classifyPath(pts, kind, scale);
            if (motion && !(lastTyped.letter === motion.letter && now - lastTyped.at < 1500)) {
              const replacePrevious = lastTyped.letter === shape.letter && now - lastTyped.at < REPLACE_WINDOW_MS;
              lastTyped = { letter: motion.letter, at: now };
              path = []; reset();
              onLetterRef.current?.({ letter: motion.letter, replacePrevious, confidence: motion.confidence });
            }
          }

          // Decide over the last ~0.6 s, not one frame.
          votes.push(found ? found.letter : null, found ? found.confidence : 0);
          const g = votes.get();
          if (g.ambiguous) show({ letter: null, unsure: g.ambiguous }, 0);
          else if (g.label) show({ letter: g.label, confidence: g.confidence }, votes.progress());
          else show(null, 0);

          const cooling = lastFired.id === g.label && now - lastFired.at < LETTER_REPEAT_MS;
          if (g.ready && !cooling) {
            lastFired = { id: g.label, at: now };
            lastTyped = { letter: g.label, at: now };
            votes.clear();
            onLetterRef.current?.({ letter: g.label, replacePrevious: false, confidence: g.confidence });
          }
        } else {
          const px = lm.map((p) => ({ x: p.x * v.videoWidth, y: p.y * v.videoHeight }));
          pointsRef.current = px;
          const vec = handVector(px);
          vectorRef.current = vec;
          const custom = matchCustomGesture(vec, customRef.current);
          const top = result.gestures?.[0]?.[0];
          const builtin = top && top.score >= MIN_SCORE ? gestureById(top.categoryName) : null;
          const gesture = custom
            ? { id: `custom:${custom.gesture.id}`, emoji: '✋', label: custom.gesture.name, phrase: custom.gesture.phrase, custom: true }
            : builtin;
          if (!gesture) {
            reset();
            if (lastFired.id && now - lastFired.at > 600) lastFired = { id: null, at: 0 };
          } else if (hold(gesture.id, HOLD_FRAMES, COOLDOWN_MS, gesture)) {
            onGestureRef.current?.(gesture);
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); };
  };

  const runFramesRef = useRef(null);
  runFramesRef.current = (engine) => runFrames(engine);
  const ctrlRef = useRef(null);
  if (!ctrlRef.current) {
    ctrlRef.current = createSignController({
      hasCamera: () => Boolean(navigator.mediaDevices?.getUserMedia),
      secure: () => window.isSecureContext !== false,
      getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
      attachVideo: async (stream) => {
        const video = videoRef.current;
        if (!video) throw new Error('The camera view is not ready yet.');
        video.srcObject = stream;
        await video.play();
      },
      detachVideo: () => {
        if (videoRef.current) videoRef.current.srcObject = null;
        const c = canvasRef.current;
        c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
      },
      loadEngine: () => loadGestureEngine({ importVision: () => import('@mediapipe/tasks-vision'), wasmUrl: MEDIAPIPE_WASM, modelUrl: GESTURE_MODEL }),
      startLoop: (engine) => runFramesRef.current(engine),
    }, {
      onStatus: setStatus,
      onError: setError,
      onReset: () => { vectorRef.current = null; pointsRef.current = null; setCurrent(null); setProgress(0); setHand('none'); },
    });
  }
  const ctrl = ctrlRef.current;

  const start = useCallback(() => ctrl.start(), [ctrl]);
  const stop = useCallback(() => ctrl.stop(), [ctrl]);
  const reject = useCallback(() => rejectRef.current(), []);

  // Leaving the page (or React StrictMode's trial unmount) releases the camera, the loop and the model.
  useEffect(() => () => ctrl.destroy(), [ctrl]);

  return { videoRef, canvasRef, vectorRef, pointsRef, status, error, hand, current, progress, start, stop, reject };
}
