import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_WORD, PAUSE_MS, addLine, createSpeller, phraseText } from '../src/lib/meet/subtitles.js';

test('phrase signs become readable sentences', () => {
  assert.equal(phraseText('THANK YOU'), 'Thank you');
  assert.equal(phraseText('I LOVE YOU'), 'I love you');
  assert.equal(phraseText('HELP'), 'Help');
  assert.equal(phraseText(''), '');
  assert.equal(phraseText(null), '');
});

test('fingerspelled letters become one word when the signer pauses', () => {
  const s = createSpeller();
  assert.equal(s.letter('h', 1000), null);
  s.letter('E', 1500); s.letter('l', 2000); s.letter('L', 2500); s.letter('o', 3000);
  assert.equal(s.pending, 'HELLO');
  assert.equal(s.tick(3000 + PAUSE_MS - 1), null, 'not yet: the signer may still be spelling');
  assert.equal(s.tick(3000 + PAUSE_MS), 'HELLO');
  assert.equal(s.pending, '');
  assert.equal(s.tick(99999), null, 'nothing left to send');
});

test('only the first character of each letter is used, and empty input is ignored', () => {
  const s = createSpeller();
  s.letter('', 1); s.letter(null, 2); s.letter('xyz', 3);
  assert.equal(s.pending, 'X');
});

test('a very long run is sent without waiting for a pause', () => {
  const s = createSpeller();
  let sent = null;
  for (let i = 0; i < MAX_WORD; i += 1) sent = s.letter('A', i) || sent;
  assert.equal(sent, 'A'.repeat(MAX_WORD));
  assert.equal(s.pending, '');
});

test('clear throws away a half-spelled word', () => {
  const s = createSpeller();
  s.letter('A', 1); s.clear();
  assert.equal(s.flush(), null);
});

test('the log keeps only the latest lines', () => {
  let lines = [];
  for (let i = 0; i < 50; i += 1) lines = addLine(lines, i, 40);
  assert.equal(lines.length, 40);
  assert.equal(lines[0], 10);
  assert.equal(lines[39], 49);
});
