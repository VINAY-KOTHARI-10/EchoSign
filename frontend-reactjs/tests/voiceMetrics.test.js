import test from 'node:test';
import assert from 'node:assert/strict';
import { estimatePitch, frameLevelDb, summarizeVoice, describePitch, describeLoudness, SILENCE_DB } from '../src/lib/voiceMetrics.js';
import { pickUnseen, loadRecent, rememberPhrase, avoidParam, RECENT_MAX } from '../src/lib/phrasePicker.js';

const SR = 16000;
const tone = (hz, amp = 0.3, n = 1024) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));

test('pitch of a steady tone is found within a few hertz', () => {
  for (const hz of [110, 180, 220, 300]) {
    const got = estimatePitch(tone(hz), SR);
    assert.ok(got && Math.abs(got - hz) < hz * 0.03, `${hz} Hz measured as ${got}`);
  }
});

test('silence and noise are not voiced', () => {
  assert.equal(estimatePitch(new Float32Array(1024), SR), null);
  assert.equal(estimatePitch(tone(200, 0.0005), SR), null);
  let seed = 3; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const noise = Float32Array.from({ length: 1024 }, () => rand() * 0.4);
  assert.equal(estimatePitch(noise, SR), null);
});

test('level in decibels follows the amplitude', () => {
  assert.ok(frameLevelDb(tone(200, 0.5)) > frameLevelDb(tone(200, 0.05)));
  assert.equal(frameLevelDb(new Float32Array(100)), -120);
});

test('a flat voice has a tiny pitch spread, a lively one a wide spread', () => {
  const flat = Array.from({ length: 60 }, () => ({ db: -30, pitch: 200 }));
  const lively = Array.from({ length: 60 }, (_, i) => ({ db: -30 + (i % 10), pitch: 200 * 2 ** (Math.sin(i / 4) * 5 / 12) }));
  const f = summarizeVoice(flat, 3); const l = summarizeVoice(lively, 3);
  assert.equal(f.pitchStdSemitones, 0);
  assert.ok(l.pitchStdSemitones > 2.5, `lively spread ${l.pitchStdSemitones}`);
  assert.equal(describePitch(f.pitchStdSemitones), 'Flat');
  assert.equal(describePitch(l.pitchStdSemitones), 'Lively');
  assert.ok(l.loudnessStdDb > f.loudnessStdDb);
});

test('too little voiced audio gives no pitch figures instead of invented ones', () => {
  const s = summarizeVoice([{ db: -30, pitch: 200 }, { db: SILENCE_DB - 5, pitch: null }], 0.2);
  assert.equal(s.pitchStdSemitones, null);
  assert.equal(s.loudnessStdDb, null);
  assert.equal(describePitch(null), null);
  assert.equal(describeLoudness(null), null);
});

test('phrases come in random order and each is shown once per set', () => {
  const seen = new Set(); const order = [];
  let i; let seed = 11; const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  while ((i = pickUnseen(8, seen, rng)) !== null) { order.push(i); seen.add(i); }
  assert.equal(order.length, 8);
  assert.equal(new Set(order).size, 8);
  assert.notDeepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(pickUnseen(3, new Set([0, 1, 2])), null);
});

test('recent phrases are remembered, newest first, without repeats and with a cap', () => {
  const mem = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; } };
  rememberPhrase('Hello', mem); rememberPhrase('Good morning', mem); rememberPhrase('Hello', mem);
  assert.deepEqual(loadRecent(mem), ['Hello', 'Good morning']);
  for (let n = 0; n < RECENT_MAX + 10; n++) rememberPhrase(`phrase ${n}`, mem);
  assert.equal(loadRecent(mem).length, RECENT_MAX);
  assert.equal(avoidParam(['a|b', 'c']), 'a b|c');
});
