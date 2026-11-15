// Tests for the temporal recognition layer (stability, ambiguity rejection, confidence gating).
// The hands are synthetic (lib/handModel.js), so these check the DECISION LOGIC. They say nothing about accuracy on
// real cameras; that is measured with the Recognition test tab and scripts/eval-signs.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VoteWindow, MIN_CONFIDENCE, RELIABLE_VOTES, SHAKY_VOTES, confidenceLabel, votesNeeded } from '../src/lib/recognition.js';
import { classifyLetter } from '../src/lib/fingerspelling.js';
import { buildHand, LETTER_POSES } from '../src/lib/handModel.js';

const feed = (w, label, conf, n) => { for (let i = 0; i < n; i += 1) w.push(label, conf); };

test('one stray frame cannot type a letter', () => {
  const w = new VoteWindow();
  w.push('B', 0.85);
  assert.equal(w.get().ready, false);
  feed(w, 'B', 0.85, 5);
  assert.equal(w.get().ready, false, 'still too few frames');
});

test('a steady, confident letter is accepted after enough frames', () => {
  const w = new VoteWindow();
  feed(w, 'B', 0.85, RELIABLE_VOTES + 2);
  const g = w.get();
  assert.equal(g.ready, true);
  assert.equal(g.label, 'B');
  assert.ok(g.confidence > 0.6);
});

test('brief tracking glitches do not break a steady letter (unlike consecutive-frame counting)', () => {
  const w = new VoteWindow();
  for (let i = 0; i < 18; i += 1) w.push(i % 6 === 5 ? null : 'V', 0.85); // 3 dropped frames in 18
  assert.equal(w.get().label, 'V');
  assert.equal(w.get().ready, true);
});

test('a shape that flickers between two letters is rejected as ambiguous, not forced', () => {
  const w = new VoteWindow();
  for (let i = 0; i < 18; i += 1) w.push(i % 2 ? 'S' : 'T', 0.6);
  const g = w.get();
  assert.equal(g.ready, false);
  assert.deepEqual([...g.ambiguous].sort(), ['S', 'T']);
});

test('low confidence is not accepted however long it is held', () => {
  const w = new VoteWindow();
  feed(w, 'E', MIN_CONFIDENCE - 0.1, 18);
  assert.equal(w.get().ready, false);
});

test('look-alike letters must be held longer than clear ones', () => {
  assert.ok(votesNeeded('S') > votesNeeded('B'));
  const w = new VoteWindow();
  feed(w, 'S', 0.7, RELIABLE_VOTES + 1);
  assert.equal(w.get().ready, false, 'enough for B, not enough for S');
  feed(w, 'S', 0.7, SHAKY_VOTES);
  assert.equal(w.get().ready, true);
});

test('progress rises toward 1 and clear() resets it', () => {
  const w = new VoteWindow();
  assert.equal(w.progress(), 0);
  feed(w, 'L', 0.85, 6);
  const mid = w.progress();
  assert.ok(mid > 0 && mid < 1);
  feed(w, 'L', 0.85, 8);
  assert.equal(w.progress(), 1);
  w.clear();
  assert.equal(w.progress(), 0);
  assert.equal(w.get().label, null);
});

test('confidence wording is honest and monotonic', () => {
  assert.equal(confidenceLabel(0.8), 'High');
  assert.equal(confidenceLabel(0.55), 'Medium');
  assert.equal(confidenceLabel(0.2), 'Low');
});

// Self-consistency on jittered synthetic hands: clearly separated letters should be accepted, never confused.
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const noisy = (lm, rand, amount) => lm.map((p) => ({ x: p.x + (rand() - 0.5) * amount, y: p.y + (rand() - 0.5) * amount }));

for (const letter of ['B', 'F', 'L', 'V', 'W', 'Y', 'O', 'C', 'D', 'U']) {
  test(`synthetic ${letter} with tracking jitter is accepted as ${letter}`, () => {
    const rand = rng(letter.charCodeAt(0));
    const base = buildHand({ ...LETTER_POSES[letter], scale: 200 });
    const w = new VoteWindow();
    for (let i = 0; i < 18; i += 1) {
      const found = classifyLetter(noisy(base, rand, 2)); // about 1% of the hand size
      w.push(found ? found.letter : null, found ? found.confidence : 0);
    }
    const g = w.get();
    assert.equal(g.label, letter);
    assert.equal(g.ready, true, `expected ${letter} to be accepted (votes ${g.votes}, ratio ${g.ratio.toFixed(2)}, conf ${g.confidence})`);
  });
}
