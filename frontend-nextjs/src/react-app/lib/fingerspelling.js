// ASL fingerspelling from MediaPipe hand landmarks (21 points per hand).
//
// Landmark indices: 0 wrist | thumb 1-4 | index 5-8 | middle 9-12 | ring 13-16 | pinky 17-20
// (MCP, PIP, DIP, TIP for each finger). Pass points in PIXEL space (x * width, y * height),
// not normalised space, so angles and distances are not distorted by the video aspect ratio.
//
// This is a rule-based classifier, not a trained model: it measures which fingers are straight,
// bent or curled and where the thumb sits, then maps that to a letter. Letters that differ only
// in thumb placement (A, E, M, N, S, T) are the least reliable. J and Z involve motion and are
// detected separately by classifyPath().

const FINGERS = { index: [5, 6, 7, 8], middle: [9, 10, 11, 12], ring: [13, 14, 15, 16], pinky: [17, 18, 19, 20] };

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (v) => { const n = Math.hypot(v.x, v.y) || 1e-6; return { x: v.x / n, y: v.y / n }; };
const angle = (a, b) => (Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * 180) / Math.PI;

// S = straight, B = bent (hooked / C-shaped), C = curled into the palm
const STRAIGHT_MIN = 0.88;
const BENT_MIN = 0.62;

const fingerState = (lm, [mcp, pip, dip, tip]) => {
  const chain = dist(lm[mcp], lm[pip]) + dist(lm[pip], lm[dip]) + dist(lm[dip], lm[tip]);
  const r = dist(lm[mcp], lm[tip]) / (chain || 1e-6); // 1 = perfectly straight, small = folded
  return r >= STRAIGHT_MIN ? 'S' : r >= BENT_MIN ? 'B' : 'C';
};

export function handFeatures(lm) {
  const wrist = lm[0];
  const S = dist(wrist, lm[9]) || 1e-6; // palm length: the unit for every distance below
  const u = unit(sub(lm[9], wrist)); // direction the hand points
  let v = sub(lm[17], lm[5]); // across the knuckles, index → pinky
  v = unit({ x: v.x - dot(v, u) * u.x, y: v.y - dot(v, u) * u.y });
  const width = dot(sub(lm[17], lm[5]), v) / S;
  // hand frame: a = height along the hand (0 at wrist, 1 at middle knuckle), b = across (0 at index knuckle)
  const frame = (p) => ({ a: dot(sub(p, wrist), u) / S, b: dot(sub(p, lm[5]), v) / S });

  const st = {};
  Object.entries(FINGERS).forEach(([name, ids]) => { st[name] = fingerState(lm, ids); });

  const thumbTip = lm[4];
  const t = frame(thumbTip);
  const tipFrames = [8, 12, 16, 20].map((i) => frame(lm[i]));
  return {
    S, u, width, st,
    orient: u.y < -0.5 ? 'up' : u.y > 0.5 ? 'down' : 'side', // image y grows downward
    thumbExt: dist(thumbTip, lm[5]) / S, // far from the index knuckle = thumb stuck out
    thumbStraight: dist(lm[1], thumbTip) / ((dist(lm[1], lm[2]) + dist(lm[2], lm[3]) + dist(lm[3], thumbTip)) || 1e-6),
    thumbAngle: angle(sub(lm[4], lm[2]), sub(lm[8], lm[5])), // thumb vs index direction
    ta: t.a, tb: t.b / (width || 1), // thumb tip height / position across the hand (0 index … 1 pinky)
    fingertipHeight: tipFrames.reduce((s, p) => s + p.a, 0) / 4,
    d: (i, j) => dist(lm[i], lm[j]) / S,
    gap: {
      im: dist(lm[8], lm[12]) / (dist(lm[5], lm[9]) || 1e-6),
      mr: dist(lm[12], lm[16]) / (dist(lm[9], lm[13]) || 1e-6),
      rp: dist(lm[16], lm[20]) / (dist(lm[13], lm[17]) || 1e-6),
    },
    tipB: { index: frame(lm[8]).b, middle: frame(lm[12]).b },
    kB: { index: frame(lm[5]).b, middle: frame(lm[9]).b },
  };
}

// Returns { letter, confidence } or null. J and Z are not returned here (they need motion).
export function classifyLetter(lm) {
  if (!lm || lm.length < 21) return null;
  const f = handFeatures(lm);
  const { index: I, middle: M, ring: R, pinky: P } = f.st;
  const pick = (letter, confidence = 0.8) => ({ letter, confidence });

  // Thumb sticking out to the index side of the hand (L, Y, G), as opposed to tucked across the palm.
  const thumbOut = (f.thumbStraight >= 0.88 && f.tb < -0.12 && f.thumbExt > 0.42) || f.thumbExt > 0.85;

  const thumbToIndexTip = f.d(4, 8);
  const TOGETHER = 1.3; // tip gap / knuckle gap: fingers held side by side stay under this

  // ── Four fingers straight ──────────────────────────────────────────────
  if (I === 'S' && M === 'S' && R === 'S' && P === 'S') {
    const together = f.gap.im < TOGETHER && f.gap.mr < TOGETHER && f.gap.rp < 1.6; // the little finger is shorter and tends to splay a little
    return !thumbOut && together ? pick('B', 0.85) : null; // spread open hand = "5", not a letter
  }

  // ── F: thumb and index touch, other three straight ─────────────────────
  if (M === 'S' && R === 'S' && P === 'S' && thumbToIndexTip < 0.4) return pick('F');

  // ── W: three fingers straight, pinky down ──────────────────────────────
  if (I === 'S' && M === 'S' && R === 'S' && P !== 'S' && f.gap.im >= 1.15) return pick('W');

  // ── Index + middle straight ────────────────────────────────────────────
  if (I === 'S' && M === 'S' && R !== 'S' && P !== 'S') {
    const spread = f.gap.im >= TOGETHER;
    if (f.tipB.index > f.tipB.middle - 0.02 && f.gap.im < 1.0) return pick('R', 0.65); // tips crossed
    if (spread && f.d(4, 10) < 0.5) return pick(f.orient === 'down' ? 'P' : 'K', 0.7); // thumb at middle knuckle
    if (!spread) return pick(f.orient === 'up' ? 'U' : 'H');
    return pick('V', 0.85);
  }

  // ── Index only ─────────────────────────────────────────────────────────
  if (I === 'S' && M !== 'S' && R !== 'S' && P !== 'S') {
    if (thumbOut) {
      if (f.thumbAngle >= 55) return pick('L', 0.85);
      return pick(f.orient === 'down' ? 'Q' : 'G', 0.7);
    }
    return pick('D', f.d(4, 12) < 0.55 ? 0.8 : 0.6);
  }

  // ── Index hooked ───────────────────────────────────────────────────────
  if (I === 'B' && M === 'C' && R === 'C' && P === 'C') return pick('X', 0.7);

  // ── Pinky only: I (thumb in) or Y (thumb out) ──────────────────────────
  if (P === 'S' && I !== 'S' && M !== 'S' && R !== 'S') return pick(thumbOut ? 'Y' : 'I', 0.85);

  // ── Rounded shapes: O and C ────────────────────────────────────────────
  const noneStraight = I !== 'S' && M !== 'S' && R !== 'S' && P !== 'S';
  const anyBent = I === 'B' || M === 'B' || R === 'B' || P === 'B';
  if (noneStraight && anyBent) {
    if (thumbToIndexTip < 0.3) return pick('O', 0.75);
    if (thumbToIndexTip < 1.0 && f.thumbExt > 0.45) return pick('C', 0.75);
  }

  // ── Fist family: A, E, M, N, S, T (differ only by the thumb) ───────────
  if (I === 'C' && M === 'C' && R === 'C' && P === 'C') {
    if (f.thumbStraight >= 0.88 && f.tb < 0.15) return pick('A', 0.7);
    if (f.ta < 0.5) return pick('E', 0.5);
    if (Math.abs(f.ta - f.fingertipHeight) < 0.15 && f.tb >= 0.4) return pick('S', 0.55);
    if (f.tb < 0.4) return pick('T', 0.5);
    if (f.tb < 0.7) return pick('N', 0.5);
    return pick('M', 0.5);
  }
  return null;
}

// ── Motion letters: J and Z ────────────────────────────────────────────────
// `points` are fingertip positions [{x, y, t}] (pixels, t in ms) over about a second.
// Direction-agnostic, so it works for left- and right-handed signers and mirrored cameras.
export function classifyPath(points, kind, handScale) {
  if (!points || points.length < 8 || !handScale) return null;
  const pts = points.map((p) => ({ x: p.x / handScale, y: p.y / handScale }));
  let len = 0; const cum = [0];
  for (let i = 1; i < pts.length; i++) { len += dist(pts[i], pts[i - 1]); cum.push(len); }
  if (len < 1.2) return null; // too small to be a deliberate stroke

  // direction of the stretch of path between two arc-length fractions
  const seg = (from, to) => {
    const at = (frac) => {
      const target = len * frac;
      let i = cum.findIndex((c) => c >= target);
      if (i < 0) i = pts.length - 1;
      return pts[i];
    };
    const a = at(from); const b = at(to);
    return { dx: b.x - a.x, dy: b.y - a.y };
  };

  if (kind === 'Z') {
    const s1 = seg(0, 0.3); const s2 = seg(0.33, 0.67); const s3 = seg(0.7, 1);
    const side = Math.sign(s1.dx) || 1;
    const bar1 = s1.dx * side > Math.abs(s1.dy) * 1.2;       // across
    const diag = s2.dx * side < -0.25 && s2.dy > 0.25;        // back and down
    const bar3 = s3.dx * side > Math.abs(s3.dy) * 1.2;        // across again
    return bar1 && diag && bar3 ? { letter: 'Z', confidence: 0.6 } : null;
  }
  if (kind === 'J') {
    const down = seg(0, 0.55); const hook = seg(0.6, 1);
    const goesDown = down.dy > Math.abs(down.dx) * 1.5 && down.dy > 0.4;
    const curls = Math.abs(hook.dx) > 0.25 && hook.dy < down.dy * 0.7;
    return goesDown && curls ? { letter: 'J', confidence: 0.55 } : null;
  }
  return null;
}

// Reference for the on-screen chart. `shaky` marks the letters this classifier confuses most.
export const LETTERS = {
  A: { hint: 'Fist, thumb straight up beside the index finger', shaky: true },
  B: { hint: 'Flat hand, fingers together and straight up, thumb across the palm' },
  C: { hint: 'Curve the hand like holding a cup' },
  D: { hint: 'Index finger up, other fingers touch the thumb' },
  E: { hint: 'Fingers curled down, thumb tucked underneath', shaky: true },
  F: { hint: 'Thumb and index touch in a circle, other three fingers up' },
  G: { hint: 'Index and thumb point sideways, parallel' },
  H: { hint: 'Index and middle point sideways, together' },
  I: { hint: 'Fist with the little finger up' },
  J: { hint: 'Make an I, then draw a J in the air', motion: true, shaky: true },
  K: { hint: 'Index and middle up in a V, thumb touching the middle finger' },
  L: { hint: 'Index up and thumb out, making an L' },
  M: { hint: 'Fist, thumb under three fingers', shaky: true },
  N: { hint: 'Fist, thumb under two fingers', shaky: true },
  O: { hint: 'All fingertips touch the thumb in an O' },
  P: { hint: 'Like K, pointing down' },
  Q: { hint: 'Like G, pointing down' },
  R: { hint: 'Index and middle crossed' },
  S: { hint: 'Fist, thumb across the front of the fingers', shaky: true },
  T: { hint: 'Fist, thumb poking between index and middle', shaky: true },
  U: { hint: 'Index and middle up, together' },
  V: { hint: 'Index and middle up, apart (peace sign)' },
  W: { hint: 'Index, middle and ring up, spread' },
  X: { hint: 'Index finger hooked, others in a fist' },
  Y: { hint: 'Thumb and little finger out' },
  Z: { hint: 'Point with the index finger, then draw a Z in the air', motion: true, shaky: true },
};
