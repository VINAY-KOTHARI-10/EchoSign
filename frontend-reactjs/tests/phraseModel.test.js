import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadPhraseModel, mirrorFeatures, normalizeLandmarks, predictPhrase, predictProba } from '../src/lib/meet/phraseModel.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => JSON.parse(readFileSync(join(here, rel), 'utf8'));
const model = read('../public/models/phrase-signs.json');
const reference = read('fixtures/phrase-signs-vectors.json'); // answers computed by scikit-learn on the original model

test('the exported model has the same classes, trees and feature count as the original', () => {
  assert.equal(model.trees.length, 100);
  assert.equal(model.features, 63);
  assert.deepEqual(model.classes, ['HELLO', 'HELP', 'I LOVE YOU', 'NO', 'PAIN', 'PEACE', 'PLEASE', 'SORRY', 'STOP', 'SUPERB', 'THANK YOU', 'YES']);
});

test('every prediction matches scikit-learn on 80 reference inputs', () => {
  assert.equal(reference.inputs.length, 80);
  reference.inputs.forEach((x, i) => {
    const proba = predictProba(model, x);
    const label = model.classes[proba.indexOf(Math.max(...proba))];
    assert.equal(label, reference.pred[i], `input ${i}: label`);
    proba.forEach((p, c) => assert.ok(Math.abs(p - reference.proba[i][c]) < 1e-6, `input ${i}: probability of class ${c}`));
  });
});

test('landmarks are prepared the way the model was trained: wrist at the origin, largest value 1', () => {
  const hand = Array.from({ length: 21 }, (_, i) => ({ x: 0.4 + i * 0.01, y: 0.5 - i * 0.015, z: 0.02 * i }));
  const f = normalizeLandmarks(hand);
  assert.equal(f.length, 63);
  assert.deepEqual(f.slice(0, 3), [0, 0, 0]);
  assert.equal(Math.max(...f.map(Math.abs)), 1);
});

test('bad landmark input is refused, not guessed', () => {
  assert.equal(normalizeLandmarks(null), null);
  assert.equal(normalizeLandmarks([{ x: 0, y: 0, z: 0 }]), null);
  assert.equal(normalizeLandmarks(Array.from({ length: 21 }, () => ({ x: NaN, y: 0, z: 0 }))), null);
  assert.equal(predictPhrase(model, []), null);
});

test('mirroring flips only the left-right axis', () => {
  const f = Array.from({ length: 63 }, (_, i) => i + 1);
  const m = mirrorFeatures(f);
  assert.equal(m[0], -1); assert.equal(m[1], 2); assert.equal(m[2], 3); assert.equal(m[3], -4);
});

test('a prediction needs enough confidence, otherwise there is no label', () => {
  const hand = Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + Math.sin(i) * 0.1, y: 0.5 + Math.cos(i * 1.3) * 0.1, z: Math.sin(i * 2) * 0.05 }));
  const strict = predictPhrase(model, hand, { minProbability: 1.01 });
  assert.equal(strict.label, null);
  assert.ok(strict.probability >= 0 && strict.probability <= 1);
  const lenient = predictPhrase(model, hand, { minProbability: 0 });
  assert.ok(model.classes.includes(lenient.label));
});

test('loading checks the file is a model', async () => {
  const ok = await loadPhraseModel('x', async () => ({ ok: true, json: async () => model }));
  assert.equal(ok.trees.length, 100);
  await assert.rejects(loadPhraseModel('x', async () => ({ ok: true, json: async () => ({ nope: 1 }) })), /not valid/);
  await assert.rejects(loadPhraseModel('x', async () => ({ ok: false })), /Could not load/);
});
