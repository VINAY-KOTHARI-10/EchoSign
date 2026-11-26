import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldErrors, forgotSchema, loginSchema, registerSchema, resetSchema } from '../src/lib/schemas.js';

const good = { email: 'sam@school.edu', username: 'sam_22', password: 'Tr1cky-Horse9', confirm: 'Tr1cky-Horse9' };

test('login: needs a valid email and a password', () => {
  assert.equal(loginSchema.safeParse({ email: 'sam@school.edu', password: 'x' }).success, true);
  const errs = fieldErrors(loginSchema.safeParse({ email: 'nope', password: '' }));
  assert.match(errs.email, /valid email/i);
  assert.match(errs.password, /password/i);
});

test('register: a good form passes', () => assert.equal(registerSchema.safeParse(good).success, true));

test('register: each field reports its own message', () => {
  const errs = fieldErrors(registerSchema.safeParse({ email: 'x', username: 'ab', password: 'short', confirm: '' }));
  assert.ok(errs.email && errs.username && errs.password && errs.confirm);
  assert.match(errs.username, /at least 3/);
  assert.match(errs.password, /8 characters/);
});

test('register: mismatched confirmation and weak passwords are caught', () => {
  assert.match(fieldErrors(registerSchema.safeParse({ ...good, confirm: 'other' })).confirm, /do not match/);
  assert.match(fieldErrors(registerSchema.safeParse({ ...good, password: 'Password123', confirm: 'Password123' })).password, /too common/);
  assert.match(fieldErrors(registerSchema.safeParse({ ...good, email: 'himesh@x.com', password: 'himesh2026x', confirm: 'himesh2026x' })).password, /email name/);
});

test('forgot password: only an email is needed', () => {
  assert.equal(forgotSchema.safeParse({ email: ' a@b.co ' }).data.email, 'a@b.co'); // trimmed
  assert.match(fieldErrors(forgotSchema.safeParse({ email: '' })).email, /Enter your email/);
});

test('reset: strong password and matching confirmation', () => {
  assert.equal(resetSchema.safeParse({ password: 'Tr1cky-Horse9', confirm: 'Tr1cky-Horse9' }).success, true);
  assert.match(fieldErrors(resetSchema.safeParse({ password: 'Tr1cky-Horse9', confirm: 'nope' })).confirm, /do not match/);
});
