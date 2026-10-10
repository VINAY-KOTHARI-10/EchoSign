// ASL fingerspelling reference: the same table the EchoSign React app uses for its sign chart.
// `shaky` marks letters the recognizer often confuses; `motion` marks J and Z, which are drawn in the air.
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

export const LETTER_KEYS = Object.keys(LETTERS);

export const signStatus = (letter) => (LETTERS[letter].motion ? 'motion' : LETTERS[letter].shaky ? 'shaky' : 'reliable');
