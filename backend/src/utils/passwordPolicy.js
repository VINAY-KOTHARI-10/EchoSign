'use strict';

// One password rule for sign-up and password reset: at least 8 characters, a letter and a number,
// not a very common password, and not just the email name. The browser shows the same rules (frontend-reactjs/src/lib/password.js).
const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyuiop', 'iloveyou1', 'letmein123', 'welcome123', 'admin123', 'abc12345', '11111111', '00000000',
  'echosign', 'echosign123',
]);

function passwordProblem(password, email = '') {
  const p = String(password || '');
  if (p.length < 8) return 'Password must be at least 8 characters.';
  if (p.length > 128) return 'Password must be at most 128 characters.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Password must contain at least one letter and one number.';
  if (COMMON.has(p.toLowerCase())) return 'That password is too common. Choose a less guessable one.';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && p.toLowerCase().includes(local)) return 'Password must not contain your email name.';
  return null;
}

// express-validator custom validator
const strongPassword = (value, { req }) => {
  const problem = passwordProblem(value, req.body && req.body.email);
  if (problem) throw new Error(problem);
  return true;
};

module.exports = { passwordProblem, strongPassword, COMMON };
