import { useCallback, useEffect, useRef, useState } from 'react';
import {
  COOLDOWN_MS, GESTURE_MODEL, HOLD_FRAMES, MEDIAPIPE_WASM, MIN_SCORE, gestureById,
} from '../lib/signGestures';
import { classifyLetter, classifyPath } from '../lib/fingerspelling';
import { handVector, matchCustomGesture } from '../lib/customGestures';

const LETTER_HOLD_FRAMES = 12;   // a letter shape must be held about 0.4 s
const LETTER_REPEAT_MS = 1400;   // holding the same shape this long types it again (e.g. "LL")
const PATH_WINDOW_MS = 1500;     // motion history used for J and Z
const SHAPE_MEMORY_MS = 700;     // J/Z motion may start a moment after the I / D shape was made
const REPLACE_WINDOW_MS = 3000;  // J/Z replaces the I / D that was typed while the hand was still

// Camera + MediaPipe hand recognition, entirely in the browser (no video leaves the device).
//   mode 'phrases' → onGesture(gesture) once per held gesture (the class's custom gestures are checked first)
//   mode 'letters' → onLetter({ letter, replacePrevious }) once per held ASL letter
// status: idle | loading | running | error.
export default function useSignRecognition({ mode = 'phrases', onGesture, onLetter, customGestures } = {}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(null); // gesture or { letter } currently being held
  const [progress, setProgress] = useState(0);  // 0..1 toward being accepted

  const recognizerRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const modeRef = useRef(mode);
  const onGestureRef = useRef(onGesture);
  const onLetterRef = useRef(onLetter);
  const customRef = useRef(customGestures);
  const vectorRef = useRef(null); // hand shape of the current frame (null when no hand), for recording gestures
  modeRef.current = mode;
  onGestureRef.current = onGesture;
  onLetterRef.current = onLetter;
  customRef.current = customGestures;

  const stop = useCallback(() => {
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const c = canvasRef.current;
    c?.getContext('2d').clearRect(0, 0, c.width, c.height);
    vectorRef.current = null;
    setCurrent(null); setProgress(0); setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    setError(''); setStatus('loading');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera is not available in this browser.');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }, audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      const vision = await import('@mediapipe/tasks-vision');
      if (!recognizerRef.current) {
        const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
        recognizerRef.current = await vision.GestureRecognizer.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: GESTURE_MODEL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 1,
        });
      }

      // per-session recognition state
      let heldId = null; let heldCount = 0; let lastFired = { id: null, at: 0 }; let lastVideoTime = -1;
      let path = []; let shape = { letter: null, at: 0 }; let lastTyped = { letter: null, at: 0 };
      const reset = () => { heldId = null; heldCount = 0; setCurrent(null); setProgress(0); };

      // Accept `id` once it has been held for `need` frames; returns true on the frame it fires.
      const hold = (id, need, repeatMs, payload) => {
        if (id === heldId) heldCount += 1; else { heldId = id; heldCount = 1; }
        setCurrent(payload); setProgress(Math.min(1, heldCount / need));
        const cooling = lastFired.id === id && performance.now() - lastFired.at < repeatMs;
        if (heldCount >= need && !cooling) { lastFired = { id, at: performance.now() }; heldCount = 0; return true; }
        return false;
      };

      runningRef.current = true;
      setStatus('running');

      const loop = () => {
        if (!runningRef.current) return;
        const v = videoRef.current; const canvas = canvasRef.current;
        if (v && v.readyState >= 2 && v.currentTime !== lastVideoTime) {
          lastVideoTime = v.currentTime;
          const now = performance.now();
          const result = recognizerRef.current.recognizeForVideo(v, now);
          const lm = result.landmarks?.[0];

          if (canvas) {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const draw = new vision.DrawingUtils(ctx);
            result.landmarks.forEach((points) => {
              draw.drawConnectors(points, vision.GestureRecognizer.HAND_CONNECTIONS, { color: '#a78bfa', lineWidth: 4 });
              draw.drawLandmarks(points, { color: '#ffffff', fillColor: '#6c3ce9', radius: 4 });
            });
          }

          vectorRef.current = null;
          if (!lm) {
            reset(); path = [];
            if (lastFired.id && now - lastFired.at > 600) lastFired = { id: null, at: 0 };
          } else if (modeRef.current === 'letters') {
            // Landmarks are normalised 0..1; scale to pixels so the hand is not stretched by the aspect ratio.
            const px = lm.map((p) => ({ x: p.x * v.videoWidth, y: p.y * v.videoHeight }));
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
                onLetterRef.current?.({ letter: motion.letter, replacePrevious });
              }
            }

            if (!found) { reset(); } else if (hold(found.letter, LETTER_HOLD_FRAMES, LETTER_REPEAT_MS, { letter: found.letter, confidence: found.confidence })) {
              lastTyped = { letter: found.letter, at: now };
              onLetterRef.current?.({ letter: found.letter, replacePrevious: false });
            }
          } else {
            const px = lm.map((p) => ({ x: p.x * v.videoWidth, y: p.y * v.videoHeight }));
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
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      stop();
      setError(err.name === 'NotAllowedError' ? 'Camera access was blocked.' : err.message || 'Could not start sign recognition.');
      setStatus('error');
    }
  }, [stop]);

  useEffect(() => () => { stop(); recognizerRef.current?.close(); recognizerRef.current = null; }, [stop]);

  return { videoRef, canvasRef, vectorRef, status, error, current, progress, start, stop };
}
