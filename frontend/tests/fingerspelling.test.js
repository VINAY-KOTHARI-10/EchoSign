// Tests for the fingerspelling classifier using synthetic hands.
// The hands are built from a small kinematic model (finger curl + thumb position), so these tests
// verify the rule logic is self-consistent. They do NOT prove accuracy on real camera footage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLetter, classifyPath } from '../src/lib/fingerspelling.js';

import { buildHand, LETTER_POSES, SIDE, DOWN } from '../src/lib/handModel.js';

// Landmarks in pixels (the classifier expects pixel space).
const hand = (pose) => buildHand({ ...pose, scale: 200 });

// J and Z are motion letters (covered by the path tests below), M and N are best-effort, so they are
// not asserted here: telling them apart from S needs depth, which a flat synthetic hand cannot show.
const POSES = Object.fromEntries(Object.entries(LETTER_POSES).filter(([k]) => !['J', 'Z', 'M', 'N'].includes(k)));

for (const [letter, pose] of Object.entries(POSES)) {
  test(`recognises ${letter}`, () => {
    const lm = hand(pose);
    const got = classifyLetter(lm);
    assert.equal(got?.letter, letter, `expected ${letter}, got ${got?.letter}`);
  });
}

test('open spread hand (5) is not a letter', () => {
  const lm = hand({ fingers: 'SSSS', thumb: { tip: [-1.0, -0.6], bend: 0 }, spread: [-0.2, -0.05, 0.1, 0.25] });
  assert.equal(classifyLetter(lm), null);
});

test('missing landmarks return null', () => {
  assert.equal(classifyLetter(null), null);
  assert.equal(classifyLetter([]), null);
});

test('result is the same for a hand rotated in the image plane', () => {
  for (const letter of ['V', 'L', 'W', 'Y']) {
    const lm = hand({ ...POSES[letter], rotate: (POSES[letter].rotate || 0) + 0.35 });
    assert.equal(classifyLetter(lm)?.letter, letter);
  }
});

// ── J / Z paths ────────────────────────────────────────────────────────────
const path = (pts) => pts.map(([x, y], i) => ({ x: x * 100, y: y * 100, t: i * 40 }));
const lerp = (a, b, n) => Array.from({ length: n }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
const Zpath = (s) => [...lerp([0, 0], [1.4 * s, 0], 8), ...lerp([1.4 * s, 0], [0, 1.4], 8), ...lerp([0, 1.4], [1.4 * s, 1.4], 8), [1.4 * s, 1.4]];

test('Z path is recognised, left or right handed', () => {
  assert.equal(classifyPath(path(Zpath(1)), 'Z', 100)?.letter, 'Z');
  assert.equal(classifyPath(path(Zpath(-1)), 'Z', 100)?.letter, 'Z');
});

test('J path is recognised', () => {
  const j = [...lerp([0, 0], [0, 1.4], 12), ...Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * (Math.PI / 2); return [-0.7 * (1 - Math.cos(a)) - 0.0, 1.4 + 0.3 * Math.sin(a) - 0.5 * (1 - Math.cos(a))]; })];
  assert.equal(classifyPath(path(j), 'J', 100)?.letter, 'J');
});

test('a straight stroke is neither J nor Z', () => {
  const line = path(lerp([0, 0], [0, 1.6], 24));
  assert.equal(classifyPath(line, 'Z', 100), null);
  assert.equal(classifyPath(line, 'J', 100), null);
});

test('a tiny jitter is ignored', () => {
  const jitter = path(Array.from({ length: 20 }, (_, i) => [0.02 * Math.sin(i), 0.02 * Math.cos(i)]));
  assert.equal(classifyPath(jitter, 'Z', 100), null);
  assert.equal(classifyPath(jitter, 'J', 100), null);
});
