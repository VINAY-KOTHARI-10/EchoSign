// Tests for the evaluation maths and the re-scoring of recorded samples. Inputs are tiny hand-made sample sets with
// known answers, so the arithmetic is verified exactly. No accuracy claim about the recogniser is made here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, repredict, toMarkdown } from '../src/lib/evaluation.js';
import { buildHand, LETTER_POSES } from '../src/lib/handModel.js';

const S = (label, predicted, meta = {}) => ({ label, predicted, meta });

test('no samples: nothing is reported (no invented numbers)', () => {
  const r = evaluate([]);
  assert.equal(r.total, 0);
  assert.equal(r.accuracy, null);
  assert.match(toMarkdown(r), /no samples/i);
});

test('accuracy, answered accuracy and rejection rate', () => {
  const r = evaluate([S('A', 'A'), S('A', 'A'), S('A', 'B'), S('B', 'B'), S('B', null), S('B', null)]);
  assert.equal(r.total, 6);
  assert.equal(r.accuracy, 3 / 6);
  assert.equal(r.answeredAccuracy, 3 / 4);
  assert.equal(r.rejectionRate, 2 / 6);
});

test('precision, recall and F1 per letter', () => {
  const r = evaluate([S('A', 'A'), S('A', 'A'), S('A', 'B'), S('B', 'B'), S('B', 'A')]);
  const a = r.perLetter.find((p) => p.letter === 'A');
  const b = r.perLetter.find((p) => p.letter === 'B');
  assert.equal(a.support, 3);
  assert.equal(a.correct, 2);
  assert.equal(a.precision, 2 / 3);
  assert.equal(a.recall, 2 / 3);
  assert.equal(b.precision, 1 / 2);
  assert.equal(b.recall, 1 / 2);
  assert.ok(Math.abs(a.f1 - 2 / 3) < 1e-9);
});

test('confusion matrix and ranked confusions', () => {
  const r = evaluate([S('S', 'T'), S('S', 'T'), S('S', 'S'), S('T', 'S'), S('A', null)]);
  assert.equal(r.matrix.S.T, 2);
  assert.equal(r.matrix.S.S, 1);
  assert.equal(r.matrix.A.rejected, 1);
  assert.deepEqual(r.confusions[0], { true: 'S', predicted: 'T', count: 2 });
});

test('accuracy can be broken down by recording condition', () => {
  const r = evaluate([
    S('A', 'A', { lighting: 'bright' }), S('A', 'A', { lighting: 'bright' }),
    S('A', 'B', { lighting: 'dim' }), S('A', null, { lighting: 'dim' }),
  ]);
  const bright = r.byMeta.lighting.find((g) => g.value === 'bright');
  const dim = r.byMeta.lighting.find((g) => g.value === 'dim');
  assert.equal(bright.accuracy, 1);
  assert.equal(dim.accuracy, 0);
  assert.equal(dim.rejectionRate, 0.5);
});

test('markdown report contains the real figures and a limitation note', () => {
  const md = toMarkdown(evaluate([S('A', 'A'), S('A', 'B')]));
  assert.match(md, /Accuracy \(correct \/ all samples\) \| 50\.0%/);
  assert.match(md, /not every user/i);
});

// re-scoring recorded frames with the current classifier
const frames = (pose, n = 18) => Array.from({ length: n }, () => buildHand({ ...pose, scale: 200 }).flatMap((p) => [p.x, p.y]));

test('re-scoring a steady recorded letter reproduces it', () => {
  const r = repredict({ label: 'W', frames: frames(LETTER_POSES.W) });
  assert.equal(r.rerun, true);
  assert.equal(r.predicted, 'W');
});

test('re-scoring a sample that matches no letter declines to answer', () => {
  const open = frames({ fingers: 'SSSS', thumb: { tip: [-1.0, -0.6], bend: 0 }, spread: [-0.2, -0.05, 0.1, 0.25] });
  assert.equal(repredict({ label: 'B', frames: open }).predicted, null);
});

test('a sample without frames keeps its stored prediction', () => {
  const r = repredict({ label: 'A', predicted: 'A', confidence: 0.7 });
  assert.equal(r.rerun, false);
  assert.equal(r.predicted, 'A');
});
