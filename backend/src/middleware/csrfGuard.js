// src/middleware/csrfGuard.js
// The refresh token lives in a cookie, so state-changing requests that carry it must come from our own site.
// Browsers always send an Origin header on cross-site POST/PUT/PATCH/DELETE; a foreign Origin is refused.
// Requests without Origin (curl, server-to-server) are allowed: they cannot ride on a victim's browser cookies.
'use strict';

const { isAllowedOrigin } = require('../config/cors');

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

const csrfGuard = (req, res, next) => {
  if (SAFE.has(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  let sameHost = false;
  try { sameHost = new URL(origin).host === req.get('host'); } catch { /* malformed Origin */ }
  if (sameHost || isAllowedOrigin(origin)) return next();
  return res.status(403).json({ success: false, error: 'Cross-site request blocked', code: 'CSRF_BLOCKED' });
};

module.exports = { csrfGuard };
