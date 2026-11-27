// Measurements taken from the microphone while someone speaks. Pure functions (no browser objects), so they are tested.
//   estimatePitch  – the fundamental frequency of one short frame, by autocorrelation (null when the frame is not voiced)
//   frameLevelDb   – how loud one frame is
//   summarizeVoice – turns the frames of a whole recording into the figures sent for analysis
// These are real measurements of the signal. Turning them into advice happens on the server.

export const MIN_HZ = 70;    // lowest pitch looked for (a deep male voice)
export const MAX_HZ = 450;   // highest pitch looked for (a high child's voice)
export const SILENCE_DB = -52;

export function frameLevelDb(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  const rms = Math.sqrt(sum / (frame.length || 1));
  return rms > 0 ? 20 * Math.log10(rms) : -120;
}

/** Autocorrelation pitch. `frame` is a Float32Array / array of samples in -1..1. Returns Hz, or null when unvoiced. */
export function estimatePitch(frame, sampleRate) {
  const n = frame.length;
  if (frameLevelDb(frame) < SILENCE_DB) return null;
  const minLag = Math.floor(sampleRate / MAX_HZ);
  const maxLag = Math.min(Math.floor(sampleRate / MIN_HZ), n - 1);
  if (maxLag <= minLag) return null;

  // normalised autocorrelation: 1 means the frame repeats perfectly after `lag` samples
  let energy0 = 0;
  for (let i = 0; i < n - maxLag; i++) energy0 += frame[i] * frame[i];
  if (energy0 === 0) return null;

  let bestLag = -1; let best = 0;
  const corr = new Array(maxLag + 2).fill(0);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0; let e = 0;
    for (let i = 0; i < n - maxLag; i++) { c += frame[i] * frame[i + lag]; e += frame[i + lag] * frame[i + lag]; }
    corr[lag] = e > 0 ? c / Math.sqrt(energy0 * e) : 0;
  }
  // first strong peak (avoids picking an octave below)
  const threshold = 0.5;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (corr[lag] >= threshold && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) { bestLag = lag; best = corr[lag]; break; }
  }
  if (bestLag < 0 || best < threshold) return null;
  // parabolic interpolation around the peak for a finer estimate
  const a = corr[bestLag - 1]; const b = corr[bestLag]; const c2 = corr[bestLag + 1];
  const shift = (a - c2) / (2 * (a - 2 * b + c2) || 1);
  const lag = bestLag + (Number.isFinite(shift) ? Math.max(-1, Math.min(1, shift)) : 0);
  return sampleRate / lag;
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const std = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))] : 0);
const r1 = (n) => Math.round(n * 10) / 10;

/**
 * frames: [{ db, pitch }]  one per analysis step (about 20 per second); pitch is Hz or null.
 * Returns the figures the server expects (see cleanClientMetrics in the backend).
 */
export function summarizeVoice(frames, durationSec) {
  const loud = frames.filter((f) => f.db > SILENCE_DB);
  const voiced = frames.filter((f) => f.pitch && f.db > SILENCE_DB);
  const out = {
    durationSec: r1(durationSec || 0),
    voicedFrames: voiced.length,
    voicedRatio: frames.length ? Math.round((voiced.length / frames.length) * 100) / 100 : 0,
    pitchMeanHz: null, pitchStdSemitones: null, pitchRangeSemitones: null, loudnessMeanDb: null, loudnessStdDb: null,
  };
  if (voiced.length >= 5) {
    const hz = voiced.map((f) => f.pitch).sort((a, b) => a - b);
    const median = percentile(hz, 0.5);
    const semis = voiced.map((f) => 12 * Math.log2(f.pitch / median));
    const sorted = [...semis].sort((a, b) => a - b);
    out.pitchMeanHz = Math.round(mean(hz));
    out.pitchStdSemitones = r1(std(semis));
    out.pitchRangeSemitones = r1(percentile(sorted, 0.95) - percentile(sorted, 0.05));
  }
  if (loud.length >= 5) {
    const db = (voiced.length >= 5 ? voiced : loud).map((f) => f.db);
    out.loudnessMeanDb = r1(mean(db));
    out.loudnessStdDb = r1(std(db));
  }
  return out;
}

/** Plain-language reading of the measurements, used by the feedback panel. */
export function describePitch(semitones) {
  if (semitones === null || semitones === undefined) return null;
  return semitones < 1.5 ? 'Flat' : semitones <= 6 ? 'Lively' : 'Very wide';
}
export function describeLoudness(db) {
  if (db === null || db === undefined) return null;
  return db < 3 ? 'Even' : db <= 9 ? 'Natural emphasis' : 'Very uneven';
}
export function describePace(pace) { return pace === 'slow' ? 'Slow' : pace === 'fast' ? 'Fast' : pace === 'natural' ? 'Natural' : null; }
