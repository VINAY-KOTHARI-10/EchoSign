import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyLetter } from '../../../lib/fingerspelling';
import { VoteWindow } from '../../../lib/recognition';
import { MEDIAPIPE_WASM } from '../../../lib/signGestures';
import { loadPhraseModel, predictPhrase } from '../../../lib/meet/phraseModel';
import { createSpeller, phraseText } from '../../../lib/meet/subtitles';

// Sign recognition for a meeting. It watches the camera picture the meeting already shows (no second camera), finds the
// hand with MediaPipe in the browser and turns signs into text: fingerspelled letters become words, and twelve phrase
// signs (Hello, Thank you, Help...) become sentences. Nothing is uploaded; only the resulting text is shared.
//
// Hand tracking files are looked for on this server first (so it works on a hotspot with no internet) and on the
// public CDN second (so it also works where those files were not installed).
const LOCAL_WASM = '/mediapipe/wasm';
const LOCAL_MODEL = '/models/hand_landmarker.task';
const CDN_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FRAME_MS = 80;           // about 12 looks per second is plenty for signs and keeps weak laptops cool
const PHRASE_WINDOW = 12;      // a phrase needs to be seen in most of the last 12 looks
const PHRASE_NEEDED = 9;
const PHRASE_COOLDOWN_MS = 2500;

async function createLandmarker(vision) {
  const attempts = [[LOCAL_WASM, LOCAL_MODEL], [MEDIAPIPE_WASM, CDN_MODEL]];
  let last;
  for (const [wasm, model] of attempts) {
    try {
      const fileset = await vision.FilesetResolver.forVisionTasks(wasm);
      const make = (delegate) => vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: model, delegate }, runningMode: 'VIDEO', numHands: 1,
        minHandDetectionConfidence: 0.4, minHandPresenceConfidence: 0.4, minTrackingConfidence: 0.4,
      });
      try { return await make('GPU'); } catch { return await make('CPU'); }
    } catch (err) { last = err; }
  }
  throw last || new Error('Hand tracking could not be loaded.');
}

export default function useMeetSign({ videoRef, onWord, onPhrase }) {
  const [state, setState] = useState({ status: 'off', error: '', letter: null, phrase: null, spelling: '' });
  const cb = useRef({ onWord, onPhrase });
  cb.current = { onWord, onPhrase };
  const run = useRef({ gen: 0, timer: null, landmarker: null });

  const stop = useCallback(() => {
    run.current.gen += 1;
    clearInterval(run.current.timer); run.current.timer = null;
    try { run.current.landmarker?.close(); } catch { /* already closed */ }
    run.current.landmarker = null;
    setState({ status: 'off', error: '', letter: null, phrase: null, spelling: '' });
  }, []);

  const start = useCallback(async () => {
    if (run.current.landmarker || run.current.loading) return;
    const gen = (run.current.gen += 1);
    const alive = () => run.current.gen === gen;
    run.current.loading = true;
    setState((s) => ({ ...s, status: 'loading', error: '' }));
    let landmarker; let phraseModel = null;
    try {
      const vision = await import('@mediapipe/tasks-vision');
      [landmarker, phraseModel] = await Promise.all([
        createLandmarker(vision),
        loadPhraseModel().catch(() => null), // letters still work without the phrase model
      ]);
    } catch (err) {
      run.current.loading = false;
      if (alive()) setState({ status: 'error', error: err.message || 'Hand tracking could not be loaded.', letter: null, phrase: null, spelling: '' });
      return;
    }
    run.current.loading = false;
    if (!alive()) { try { landmarker.close(); } catch { /* ignore */ } return; } // stopped while loading
    run.current.landmarker = landmarker;

    const votes = new VoteWindow();
    const speller = createSpeller();
    const recent = []; let lastPhraseAt = 0; let lastLetter = { id: '', at: 0 };
    let lastVideoTime = -1;
    setState({ status: 'running', error: '', letter: null, phrase: null, spelling: '' });

    run.current.timer = setInterval(() => {
      if (!alive()) return;
      const v = videoRef.current;
      if (!v || v.readyState < 2 || v.videoWidth === 0 || v.currentTime === lastVideoTime) return;
      lastVideoTime = v.currentTime;
      const now = Date.now();
      let result;
      try { result = landmarker.detectForVideo(v, performance.now()); } catch { return; }
      const hand = result && result.landmarks && result.landmarks[0];

      let letter = null; let phrase = null;
      if (hand) {
        const px = hand.map((p) => ({ x: p.x * v.videoWidth, y: p.y * v.videoHeight }));
        const found = classifyLetter(px);
        votes.push(found ? found.letter : null, found ? found.confidence : 0);
        const g = votes.get();
        if (g.label && !g.ambiguous) letter = { letter: g.label, confidence: g.confidence };
        if (g.ready && !(lastLetter.id === g.label && now - lastLetter.at < 1500)) {
          lastLetter = { id: g.label, at: now }; votes.clear();
          const done = speller.letter(g.label, now);
          if (done) cb.current.onWord?.(done);
        }
        if (phraseModel) {
          const p = predictPhrase(phraseModel, hand);
          recent.push(p && p.label ? p.label : null);
          if (recent.length > PHRASE_WINDOW) recent.shift();
          const counts = recent.reduce((m, l) => (l ? m.set(l, (m.get(l) || 0) + 1) : m), new Map());
          const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
          if (top) phrase = { label: top, text: phraseText(top), progress: Math.min(1, n / PHRASE_NEEDED) };
          if (top && n >= PHRASE_NEEDED && now - lastPhraseAt > PHRASE_COOLDOWN_MS) {
            lastPhraseAt = now; recent.length = 0; speller.clear();
            cb.current.onPhrase?.(phraseText(top));
          }
        }
      } else { votes.push(null, 0); recent.push(null); if (recent.length > PHRASE_WINDOW) recent.shift(); }

      const word = speller.tick(now);
      if (word) cb.current.onWord?.(word);
      setState((s) => (s.status === 'running' ? { ...s, letter, phrase, spelling: speller.pending } : s));
    }, FRAME_MS);
  }, [videoRef]);

  useEffect(() => () => stop(), [stop]);

  return { ...state, start, stop };
}
