import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordStrength } from '../src/lib/password.js';

test('rules match the server', () => {
  assert.equal(passwordStrength('short1').valid, false);
  assert.equal(passwordStrength('onlyletters').valid, false);
  assert.equal(passwordStrength('Password123').valid, false);
  assert.equal(passwordStrength('himesh2026x', 'himesh@x.com').valid, false);
  assert.equal(passwordStrength('Tr1cky-Horse9').valid, true);
});
test('strength grows with length and variety', () => {
  assert.ok(passwordStrength('abcdefg1').score < passwordStrength('Abcdefghijk1!').score);
  assert.equal(passwordStrength('').label, '');
});
