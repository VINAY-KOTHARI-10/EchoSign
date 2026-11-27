import { useCallback, useEffect, useRef, useState } from 'react';
import { estimatePitch, frameLevelDb, summarizeVoice } from '../lib/voiceMetrics.js';

// Records the voice while the person speaks, and measures pitch and loudness from the same microphone signal.
// It runs next to the browser's speech recognition (which only gives text). Nothing is uploaded until the page sends the
// finished clip for analysis. If the browser blocks the microphone or has no MediaRecorder, `supported` / `error` say so
// and the page falls back to the text-only analysis.
//
//   start()   – begin recording (resolves true when the microphone is open)
//   finish()  – stop and resolve { blob, mime, url, metrics, durationSec } (null when nothing was recorded)
//   cancel()  – stop and throw the clip away

const MAX_SECONDS = 25;       // a hard stop, so a forgotten recording never grows
const STEP_MS = 50;           // one pitch / loudness reading every 50 ms
const MIME_CHOICES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

const pickMime = () => (typeof MediaRecorder === 'undefined' ? '' : MIME_CHOICES.find((m) => MediaRecorder.isTypeSupported?.(m)) || '');

export default function useVoiceCapture() {
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const run = useRef(null); // the live recording: { stream, recorder, ctx, timer, chunks, frames, startedAt, done }

  const teardown = useCallback(() => {
    const r = run.current;
    if (!r) return;
    clearInterval(r.timer); clearTimeout(r.limit);
    try { r.stream.getTracks().forEach((t) => t.stop()); } catch { /* already stopped */ }
    try { r.ctx?.close(); } catch { /* already closed */ }
    run.current = null;
    setRecording(false);
  }, []);

  useEffect(() => () => { try { run.current?.recorder?.state !== 'inactive' && run.current?.recorder?.stop(); } catch { /* ignore */ } teardown(); }, [teardown]);

  const start = useCallback(async () => {
    setError('');
    if (!supported) { setError('Voice recording is not available in this browser.'); return false; }
    if (run.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      const mime = pickMime();
      const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };

      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = Ctx ? new Ctx() : null;
      const frames = [];
      let timer = null;
      if (ctx) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        timer = setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          frames.push({ db: frameLevelDb(buf), pitch: estimatePitch(buf, ctx.sampleRate) });
        }, STEP_MS);
      }
      recorder.start(250);
      const limit = setTimeout(() => { try { recorder.state !== 'inactive' && recorder.stop(); } catch { /* ignore */ } }, MAX_SECONDS * 1000);
      run.current = { stream, recorder, ctx, timer, limit, chunks, frames, startedAt: Date.now(), mime: recorder.mimeType || mime || 'audio/webm' };
      setRecording(true);
      return true;
    } catch (err) {
      const blocked = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      setError(blocked ? 'The microphone is blocked, so your voice cannot be analysed. Allow it from the address bar and try again.' : 'Could not record your voice, so only the words will be checked.');
      teardown();
      return false;
    }
  }, [supported, teardown]);

  const finish = useCallback(() => new Promise((resolve) => {
    const r = run.current;
    if (!r) { resolve(null); return; }
    const durationSec = (Date.now() - r.startedAt) / 1000;
    const done = () => {
      const blob = new Blob(r.chunks, { type: r.mime });
      const metrics = summarizeVoice(r.frames, durationSec);
      teardown();
      resolve(blob.size > 0 ? { blob, mime: r.mime, url: URL.createObjectURL(blob), metrics, durationSec } : null);
    };
    if (r.recorder.state === 'inactive') { done(); return; }
    r.recorder.onstop = done;
    try { r.recorder.stop(); } catch { done(); }
  }), [teardown]);

  const cancel = useCallback(() => {
    const r = run.current;
    if (!r) return;
    try { r.recorder.onstop = null; r.recorder.state !== 'inactive' && r.recorder.stop(); } catch { /* ignore */ }
    teardown();
  }, [teardown]);

  return { supported, recording, error, start, finish, cancel };
}

/** Blob -> base64 text (without the data: prefix), for the JSON request. */
export const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(new Error('Could not read the recording.'));
  reader.readAsDataURL(blob);
});
