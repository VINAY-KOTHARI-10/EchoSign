// Small pure helpers: time parsing for "jump to", speech error wording, SRT output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSrt, parseClock, srtTime } from '../src/lib/captions.js';
import { SPEECH_PRIVACY, speechErrorText } from '../src/hooks/useSpeech.js';

test('parseClock accepts mm:ss and h:mm:ss, rejects everything else', () => {
  assert.equal(parseClock('12:30'), 750);
  assert.equal(parseClock('1:02:03'), 3723);
  assert.equal(parseClock(' 00:05 '), 5);
  ['', 'abc', '12', '1:2', '12:3', '99:99:99:99'].forEach((v) => assert.equal(parseClock(v), null, v));
});

test('speech errors are explained in plain language; pauses are ignored', () => {
  assert.match(speechErrorText('not-allowed'), /Microphone access was blocked/);
  assert.match(speechErrorText('network'), /internet connection/);
  assert.match(speechErrorText('audio-capture'), /No microphone/);
  assert.equal(speechErrorText('no-speech'), null);
  assert.equal(speechErrorText('aborted'), null);
  assert.match(speechErrorText('something-new'), /something-new/);
});

test('the privacy note says where audio goes', () => {
  assert.match(SPEECH_PRIVACY, /Google or Microsoft/);
  assert.match(SPEECH_PRIVACY, /no video leaves/i);
});

test('SRT times and cues are well formed and in order', () => {
  assert.equal(srtTime(3725.4), '01:02:05,400');
  const t0 = Date.UTC(2026, 10, 14, 9);
  const srt = buildSrt([
    { createdAt: new Date(t0), speakerName: 'T', source: 'SPEECH', text: 'Hello everyone' },
    { createdAt: new Date(t0 + 4000), speakerName: 'A', source: 'TEXT', text: 'Question?' },
  ]);
  const cues = srt.trim().split('\n\n');
  assert.equal(cues.length, 2);
  assert.match(cues[1], /A \(typed\): Question\?/);
});
