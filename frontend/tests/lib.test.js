import test from 'node:test';
import assert from 'node:assert/strict';
import { handVector, matchCustomGesture, vectorDistance } from '../src/lib/customGestures.js';
import { alertReason, buildSrt, csv, isQuestion, splitHighlights, srtTime } from '../src/lib/captions.js';
import { buildHand, LETTER_POSES } from '../src/lib/handModel.js';

const hand = (letter, extra = {}) => buildHand({ ...LETTER_POSES[letter], scale: 200, ...extra });
const move = (lm, dx, dy) => lm.map((p) => ({ x: p.x + dx, y: p.y + dy }));
const scaleBy = (lm, k) => lm.map((p) => ({ x: p.x * k, y: p.y * k }));
const spin = (lm, a) => lm.map((p) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) }));

test('hand vector has 42 numbers and ignores position, size and tilt', () => {
  const base = handVector(hand('V'));
  assert.equal(base.length, 42);
  const moved = handVector(move(scaleBy(spin(hand('V'), 0.5), 0.6), 300, 120));
  assert.ok(vectorDistance(base, moved) < 0.01, `distance ${vectorDistance(base, moved)}`);
});

test('custom gestures match the nearest recorded shape and reject others', () => {
  const gestures = [
    { id: 'a', phrase: 'Equation', samples: [handVector(hand('W'))] },
    { id: 'b', phrase: 'Fraction', samples: [handVector(hand('L'))] },
  ];
  assert.equal(matchCustomGesture(handVector(spin(hand('W'), 0.3)), gestures)?.gesture.id, 'a');
  assert.equal(matchCustomGesture(handVector(hand('L')), gestures)?.gesture.id, 'b');
  assert.equal(matchCustomGesture(handVector(hand('B')), gestures), null);
  assert.equal(matchCustomGesture(null, gestures), null);
  assert.equal(matchCustomGesture(handVector(hand('B')), []), null);
});

test('SRT times and cue numbering', () => {
  assert.equal(srtTime(3723.5), '01:02:03,500');
  assert.equal(srtTime(0), '00:00:00,000');
  const t0 = Date.parse('2026-01-01T10:00:00Z');
  const caps = [
    { createdAt: new Date(t0).toISOString(), speakerName: 'Ann', source: 'SPEECH', text: 'Hello everyone' },
    { createdAt: new Date(t0 + 5000).toISOString(), speakerName: 'Bo', source: 'SIGN', text: 'I have a question' },
  ];
  const srt = buildSrt(caps);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:0\d,\d{3}\nAnn: Hello everyone\n/);
  assert.match(srt, /\n2\n00:00:05,000 --> /);
  assert.match(srt, /Bo \(sign\): I have a question/);
  // captions before the recording started are dropped, and times are relative to it
  assert.match(buildSrt(caps, t0 + 4000), /^1\n00:00:01,000 --> .*\nBo \(sign\)/);
});

test('highlights split text around keywords, case-insensitively', () => {
  assert.deepEqual(splitHighlights('Photosynthesis needs light', ['photosynthesis', 'LIGHT']), [
    { text: 'Photosynthesis', hit: true }, { text: ' needs ', hit: false }, { text: 'light', hit: true },
  ]);
  assert.deepEqual(splitHighlights('nothing here', ['xyz']), [{ text: 'nothing here', hit: false }]);
  assert.deepEqual(splitHighlights('plain', []), [{ text: 'plain', hit: false }]);
  assert.equal(splitHighlights('cost is $5 (approx.)', ['$5', '(approx.)']).filter((p) => p.hit).length, 2); // regex characters are escaped
});

test('question detection', () => {
  assert.ok(isQuestion('What is the boiling point?'));
  assert.ok(isQuestion('Does anyone know the answer'));
  assert.ok(isQuestion('Right?'));
  assert.ok(!isQuestion('The answer is forty two.'));
});

test('alert reasons: name beats keyword beats question', () => {
  const opts = { username: 'maya', words: ['exam'], question: true };
  assert.equal(alertReason('Maya, can you read this?', opts), 'name');
  assert.equal(alertReason('The exam is on Friday.', opts), 'word');
  assert.equal(alertReason('Who can help?', opts), 'question');
  assert.equal(alertReason('Open your books.', opts), null);
  assert.equal(alertReason('Mayakovsky wrote poems.', opts), null); // whole words only
  assert.equal(alertReason('Who can help?', { ...opts, question: false }), null);
});

test('csv quoting', () => {
  assert.equal(csv([['a', 'b"c'], [1, null]]), '"a","b""c"\n"1",""');
});
