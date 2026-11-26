'use strict';
const { passwordProblem } = require('../src/utils/passwordPolicy');

describe('password policy', () => {
  test('accepts a reasonable password', () => expect(passwordProblem('Tr1cky-Horse9', 'a@b.co')).toBeNull());
  test('rejects short', () => expect(passwordProblem('a1b2')).toMatch(/8 characters/));
  test('needs a letter and a number', () => {
    expect(passwordProblem('abcdefghij')).toMatch(/letter and one number/);
    expect(passwordProblem('1234567890')).toMatch(/letter and one number/);
  });
  test('rejects common passwords', () => expect(passwordProblem('Password123')).toMatch(/too common/));
  test('rejects the email name', () => expect(passwordProblem('himesh2026x', 'himesh@x.com')).toMatch(/email name/));
});
