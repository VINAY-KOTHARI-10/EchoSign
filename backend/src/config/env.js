// src/config/env.js
// Fails fast in production when a required setting is missing, and warns about optional ones.
'use strict';

const REQUIRED_PROD = ['MONGODB_URI', 'DATABASE_URL', 'JWT_REFRESH_SECRET', 'SESSION_SECRET', 'FRONTEND_URL'];
const OPTIONAL = {
  GROQ_API_KEY: 'AI notes, lecture questions and translation fall back to basic non-AI behaviour',
  BREVO_API_KEY: 'login codes cannot be emailed, so nobody can verify an account',
  EMAIL_FROM: 'login codes cannot be emailed',
  GOOGLE_CLIENT_ID: 'Google sign-in is disabled',
};

function validateEnv(env = process.env, log = console) {
  const problems = [];
  const warnings = [];
  const isProd = env.NODE_ENV === 'production';

  if (!env.JWT_SECRET && !env.JWT_ACCESS_SECRET) problems.push('JWT_SECRET (or JWT_ACCESS_SECRET)');
  if (isProd) REQUIRED_PROD.forEach((k) => { if (!env[k]) problems.push(k); });
  if (isProd && env.FRONTEND_URL && !/^https:\/\//.test(env.FRONTEND_URL)) warnings.push('FRONTEND_URL should start with https:// in production');
  if (isProd && /localhost|127\.0\.0\.1/.test(env.FRONTEND_URL || '')) warnings.push('FRONTEND_URL points at localhost in production');
  if (isProd) Object.entries(OPTIONAL).forEach(([k, why]) => { if (!env[k]) warnings.push(`${k} is not set: ${why}`); });
  ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'SESSION_SECRET'].forEach((k) => {
    if (isProd && env[k] && env[k].length < 32) warnings.push(`${k} is short; use at least 32 random characters`);
  });

  warnings.forEach((w) => log.warn(`[config] ${w}`));
  if (problems.length) throw new Error(`Missing required environment variables: ${problems.join(', ')}`);
  return { warnings };
}

module.exports = { validateEnv };
