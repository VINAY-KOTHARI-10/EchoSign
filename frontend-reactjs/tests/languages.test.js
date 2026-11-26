import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGS, langBcp, langName } from '../src/lib/index.js';
import { setLanguages } from '../src/lib/languages.js';

const builtIn = LANGS.map((l) => ({ ...l }));
const restore = () => LANGS.splice(0, LANGS.length, ...builtIn);

test('the server\'s list replaces the pickers and langName/langBcp follow it', () => {
  assert.equal(setLanguages([{ code: 'en', name: 'English' }, { code: 'tr', name: 'Turkish' }]), true);
  assert.deepEqual(LANGS.map((l) => l.code), ['en', 'tr']);
  assert.equal(langName('tr'), 'Turkish');
  assert.equal(langBcp('tr'), 'tr', 'a language an admin adds uses its plain code for speech recognition');
  assert.equal(langBcp('en'), 'en-US', 'a known language keeps its locale');
  restore();
});

test('an empty or malformed answer never empties the pickers', () => {
  assert.equal(setLanguages([]), false);
  assert.equal(setLanguages(null), false);
  assert.equal(setLanguages([{ nope: 1 }]), false);
  assert.equal(LANGS.length, builtIn.length);
});

test('entries without a code or a name are skipped', () => {
  setLanguages([{ code: 'fr', name: 'French' }, { code: 5, name: 'Bad' }, { name: 'NoCode' }]);
  assert.deepEqual(LANGS.map((l) => l.code), ['fr']);
  restore();
});
