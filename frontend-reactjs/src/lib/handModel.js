// A small kinematic hand model. It builds 21 MediaPipe-style landmarks from "finger curl" + "thumb
// position", and is used for (1) the schematic ASL hand diagrams in the UI and (2) synthetic hands in
// the fingerspelling tests. Coordinates are in palm lengths; y grows downward like an image.

const MCP = { index: [-0.28, -0.97], middle: [0, -1], ring: [0.27, -0.95], pinky: [0.52, -0.85] };
const SEGS = { index: [0.4, 0.24, 0.2], middle: [0.44, 0.27, 0.21], ring: [0.4, 0.25, 0.2], pinky: [0.3, 0.18, 0.16] };
const CURL = { S: 0, B: 0.55, C: 1 }; // straight, bent, curled
const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

export const SIDE = Math.PI / 2;  // hand pointing sideways
export const DOWN = Math.PI;      // hand pointing down

// fingers: 4 letters (index, middle, ring, pinky) of S/B/C. spread: radians fanned per finger.
// thumb.tip: [x, y] or a landmark index to touch (e.g. 8 = index fingertip). bendDir -1 curls toward the thumb.
export function buildHand({ fingers, spread = [0, 0, 0, 0], thumb, rotate = 0, bendDir = 1, scale = 1 }) {
  const f = typeof fingers === 'string' ? fingers.split('') : fingers;
  const pts = new Array(21);
  pts[0] = [0, 0];
  ['index', 'middle', 'ring', 'pinky'].forEach((name, i) => {
    const base = 5 + i * 4;
    const c = CURL[f[i]];
    const bends = [c * 80, c * 100, c * 60].map((d) => (bendDir * d * Math.PI) / 180);
    let [x, y] = MCP[name];
    pts[base] = [x, y];
    let acc = spread[i];
    SEGS[name].forEach((len, j) => {
      acc += bends[j];
      const [dx, dy] = rot([0, -1], acc);
      x += dx * len; y += dy * len;
      pts[base + 1 + j] = [x, y];
    });
  });
  // thumb: a quadratic curve from the thumb base to the target tip
  const cmc = [-0.3, -0.15];
  const tip = Array.isArray(thumb.tip) ? thumb.tip : pts[thumb.tip];
  const mid = [(cmc[0] + tip[0]) / 2 + (thumb.bend || 0), (cmc[1] + tip[1]) / 2];
  const at = (t) => [0, 1].map((k) => (1 - t) ** 2 * cmc[k] + 2 * (1 - t) * t * mid[k] + t * t * tip[k]);
  pts[1] = cmc; pts[2] = at(0.4); pts[3] = at(0.75); pts[4] = tip;
  return pts.map(([x, y]) => { const [rx, ry] = rot([x, y], rotate); return { x: rx * scale, y: ry * scale }; });
}

// One representative pose per letter. J and Z reuse I and D (they add a motion).
export const LETTER_POSES = {
  A: { fingers: 'CCCC', thumb: { tip: [-0.5, -1.05], bend: 0 } },
  B: { fingers: 'SSSS', thumb: { tip: [0.05, -0.55], bend: 0.2 }, spread: [-0.03, 0, 0.03, 0.06] },
  C: { fingers: 'BBBB', thumb: { tip: [-0.95, -0.7], bend: 0 }, bendDir: -1 },
  D: { fingers: 'SCCC', thumb: { tip: [0.05, -0.85], bend: 0.3 } },
  E: { fingers: 'CCCC', thumb: { tip: [0.05, -0.3], bend: 0.1 } },
  F: { fingers: 'BSSS', thumb: { tip: 8, bend: 0.1 }, spread: [0, -0.08, 0.08, 0.16], bendDir: -1 },
  G: { fingers: 'SCCC', thumb: { tip: [-0.55, -1.35], bend: 0 }, rotate: SIDE },
  H: { fingers: 'SSCC', thumb: { tip: [0.25, -0.5], bend: 0.2 }, spread: [0, 0, 0, 0], rotate: SIDE },
  I: { fingers: 'CCCS', thumb: { tip: [0.2, -0.5], bend: 0.2 } },
  J: { fingers: 'CCCS', thumb: { tip: [0.2, -0.5], bend: 0.2 }, motion: 'J' },
  K: { fingers: 'SSCC', thumb: { tip: [-0.05, -1.3], bend: 0.05 }, spread: [-0.25, 0.25, 0, 0] },
  L: { fingers: 'SCCC', thumb: { tip: [-1.0, -0.6], bend: 0 } },
  M: { fingers: 'CCCC', thumb: { tip: [0.4, -0.6], bend: 0.1 } },
  N: { fingers: 'CCCC', thumb: { tip: [0.16, -0.6], bend: 0.1 } },
  O: { fingers: 'BBBB', thumb: { tip: 8, bend: 0.1 }, bendDir: -1 },
  P: { fingers: 'SSCC', thumb: { tip: [-0.05, -1.3], bend: 0.05 }, spread: [-0.25, 0.25, 0, 0], rotate: DOWN },
  Q: { fingers: 'SCCC', thumb: { tip: [-0.55, -1.35], bend: 0 }, rotate: DOWN },
  R: { fingers: 'SSCC', thumb: { tip: [0.25, -0.5], bend: 0.2 }, spread: [0.4, -0.1, 0, 0] },
  S: { fingers: 'CCCC', thumb: { tip: [0.16, -0.6], bend: 0.1 } },
  T: { fingers: 'CCCC', thumb: { tip: [-0.08, -0.8], bend: 0.1 } },
  U: { fingers: 'SSCC', thumb: { tip: [0.25, -0.5], bend: 0.2 }, spread: [0, 0, 0, 0] },
  V: { fingers: 'SSCC', thumb: { tip: [0.25, -0.5], bend: 0.2 }, spread: [-0.22, 0.22, 0, 0] },
  W: { fingers: 'SSSC', thumb: { tip: [0.4, -0.55], bend: 0.2 }, spread: [-0.25, 0, 0.25, 0] },
  X: { fingers: 'BCCC', thumb: { tip: [0.2, -0.45], bend: 0.2 } },
  Y: { fingers: 'CCCS', thumb: { tip: [-1.0, -0.6], bend: 0 } },
  Z: { fingers: 'SCCC', thumb: { tip: [0.05, -0.85], bend: 0.3 }, motion: 'Z' },
};

export const letterHand = (letter, scale = 1) => {
  const { motion, ...pose } = LETTER_POSES[letter];
  return buildHand({ ...pose, scale });
};
