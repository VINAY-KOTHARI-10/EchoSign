// Hand-drawn (not computed) ASL letter illustrations, as lists of simple shapes on a 100 x 100 canvas.
// Right hand, palm facing the viewer, thumb on the left. Each shape is drawn in order, so a thumb that lies across
// the fingers is listed after them and sits on top.
//
// Shapes:  ['L', x1, y1, x2, y2, width]   a rounded stroke (finger, thumb)
//          ['O', cx, cy, rx, ry, width]   an open ring (the O made by thumb and fingertips)
//          ['P', 'M… path', width]        a curved stroke (a curled hand, a hooked finger)
// `rotate` turns the whole hand about its centre (G, H sideways; P, Q pointing down). `motion` adds the J / Z path.
// These are simplified drawings for orientation, not official illustrations: the written description next to each
// letter is the reference.

const X = { i: 36, m: 46, r: 56, p: 65 };           // knuckle positions across the top of the palm
const TIP = { i: 20, m: 15, r: 20, p: 28 };          // fingertip height when a finger is straight up
const up = (f, tip = TIP[f]) => ['L', X[f], 54, X[f], tip, 9];
const curl = (f) => ['L', X[f] - 2, 61, X[f] + 2, 61, 10];  // a folded finger seen from the front: a knuckle bump
const fist = (...fingers) => fingers.map(curl);
const ALL = ['i', 'm', 'r', 'p'];

export const LETTER_ART = {
  A: { shapes: [...fist(...ALL), ['L', 27, 84, 26, 54, 10]] },                                  // thumb up along the side
  B: { shapes: [...ALL.map((f) => up(f)), ['L', 32, 80, 52, 74, 9]] },                           // thumb folded across the palm
  C: { shapes: [['P', 'M66,30 Q32,30 32,60 Q32,90 66,90', 13]] },                                // curved like a cup
  D: { shapes: [up('i', 16), ...fist('m', 'r', 'p'), ['L', 28, 86, 44, 66, 9]] },                // index up, thumb touches middle
  E: { shapes: [...ALL.map((f) => ['L', X[f], 55, X[f], 67, 10]), ['L', 33, 80, 66, 77, 9]] },   // fingers bent, thumb under
  F: { shapes: [['O', 34, 50, 9, 10, 7], up('m'), up('r'), up('p')] },                           // thumb + index circle, three up
  G: { rotate: -90, shapes: [up('i', 18), ...fist('m', 'r', 'p'), ['L', 27, 72, 27, 38, 9]] },   // sideways, index and thumb parallel
  H: { rotate: -90, shapes: [...fist('r', 'p'), up('i', 20), up('m', 16), ['L', 30, 80, 54, 66, 9]] },
  I: { shapes: [...fist('i', 'm', 'r'), up('p', 24), ['L', 34, 68, 58, 68, 9]] },
  J: { shapes: [...fist('i', 'm', 'r'), up('p', 24), ['L', 34, 68, 58, 68, 9]], motion: 'J' },
  K: { shapes: [...fist('r', 'p'), ['L', 36, 54, 30, 20, 9], ['L', 46, 54, 54, 18, 9], ['L', 30, 86, 45, 58, 9]] },
  L: { shapes: [up('i', 16), ...fist('m', 'r', 'p'), ['L', 30, 76, 6, 58, 9]] },                 // index up, thumb out
  M: { shapes: [...fist('p'), ['L', 36, 56, 36, 80, 10], ['L', 46, 56, 46, 80, 10], ['L', 56, 56, 56, 80, 10]] }, // three fingers over the thumb
  N: { shapes: [...fist('r', 'p'), ['L', 36, 56, 36, 80, 10], ['L', 46, 56, 46, 80, 10]] },                       // two fingers over the thumb
  O: { shapes: [['O', 50, 52, 21, 19, 11]] },                                                    // all fingertips meet the thumb
  P: { rotate: 180, shapes: [...fist('r', 'p'), ['L', 36, 54, 30, 20, 9], ['L', 46, 54, 54, 18, 9], ['L', 30, 86, 45, 58, 9]] },
  Q: { rotate: 180, shapes: [up('i', 18), ...fist('m', 'r', 'p'), ['L', 27, 72, 27, 38, 9]] },
  R: { shapes: [...fist('r', 'p'), ['L', 36, 54, 47, 18, 9], ['L', 46, 54, 40, 20, 9], ['L', 34, 68, 62, 68, 9]] }, // fingers crossed
  S: { shapes: [...fist(...ALL), ['L', 33, 64, 62, 64, 9]] },                                    // thumb across the front
  T: { shapes: [...fist(...ALL), ['L', 30, 84, 41, 56, 9]] },                                    // thumb pokes between index and middle
  U: { shapes: [...fist('r', 'p'), up('i', 20), up('m', 15), ['L', 34, 68, 62, 68, 9]] },
  V: { shapes: [...fist('r', 'p'), ['L', 36, 54, 28, 18, 9], ['L', 46, 54, 56, 16, 9], ['L', 34, 68, 62, 68, 9]] },
  W: { shapes: [...fist('p'), ['L', 36, 54, 26, 20, 9], up('m', 14), ['L', 56, 54, 66, 20, 9], ['L', 30, 82, 60, 66, 9]] },
  X: { shapes: [...fist('m', 'r', 'p'), ['P', 'M36,56 L36,38 Q36,30 44,32', 9], ['L', 34, 68, 62, 68, 9]] }, // index hooked
  Y: { shapes: [...fist('i', 'm', 'r'), up('p', 22), ['L', 30, 76, 6, 62, 9]] },                 // thumb and little finger out
  Z: { shapes: [up('i', 16), ...fist('m', 'r', 'p'), ['L', 28, 86, 44, 66, 9]], motion: 'Z' },
};

export const PALM = { x: 30, y: 52, w: 40, h: 42, r: 14 };
export const WRIST = { x: 37, y: 88, w: 26, h: 12, r: 5 };
export const ROTATE_ABOUT = { cx: 50, cy: 62 };
