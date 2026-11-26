// Custom class gestures: a teacher records a hand shape a few times and maps it to a phrase.
// A hand shape is reduced to 42 numbers (x, y of each of the 21 landmarks) measured in the hand's own
// frame, so it does not change when the hand moves, scales (nearer / farther) or tilts in the image.

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const unit = (v) => { const n = Math.hypot(v.x, v.y) || 1e-6; return { x: v.x / n, y: v.y / n }; };

// `lm` in pixel space (x * width, y * height). Returns 42 numbers, or null for an invalid hand.
export function handVector(lm) {
  if (!lm || lm.length < 21) return null;
  const wrist = lm[0];
  const S = Math.hypot(lm[9].x - wrist.x, lm[9].y - wrist.y);
  if (!S) return null;
  const u = unit(sub(lm[9], wrist));
  let v = sub(lm[17], lm[5]);
  v = unit({ x: v.x - dot(v, u) * u.x, y: v.y - dot(v, u) * u.y });
  const out = [];
  for (const p of lm) {
    const d = sub(p, wrist);
    out.push(Math.round((dot(d, u) / S) * 1000) / 1000, Math.round((dot(d, v) / S) * 1000) / 1000);
  }
  return out;
}

// Mean distance between two hand vectors, in palm lengths. 0 = identical shape.
export function vectorDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < 42; i += 2) sum += Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1]);
  return sum / 21;
}

// Palm lengths. Recordings of the same shape differ by about 0.04 at most (tracking jitter); clearly
// different shapes are 0.15 or more apart, so 0.1 sits safely between them.
export const MATCH_THRESHOLD = 0.1;
const MARGIN = 0.75; // the best gesture must be this much closer than the runner-up

// Best matching custom gesture for a hand vector, or null. `gestures`: [{ id, name, phrase, samples }]
export function matchCustomGesture(vec, gestures, threshold = MATCH_THRESHOLD) {
  if (!vec || !gestures?.length) return null;
  const scored = gestures
    .map((g) => ({ gesture: g, distance: Math.min(...(g.samples || []).map((sample) => vectorDistance(vec, sample)), Infinity) }))
    .sort((a, b) => a.distance - b.distance);
  const [best, runnerUp] = scored;
  if (!best || best.distance > threshold) return null;
  if (runnerUp && runnerUp.distance < Infinity && best.distance > runnerUp.distance * MARGIN) return null; // ambiguous
  return best;
}
