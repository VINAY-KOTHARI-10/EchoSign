// src/config/cors.js
// Single source of truth for which browser origins may call the API and Socket.IO.
'use strict';

const devOrigins = [3000, 3001, 5500, 5173, 8080].flatMap((p) => [
  `http://localhost:${p}`,
  `http://127.0.0.1:${p}`,
]);

const originOf = (u) => { try { return new URL(u).origin; } catch { return null; } };

const allowedOrigins = [
  ...devOrigins,
  ...[originOf(process.env.FRONTEND_URL)].filter(Boolean),
  ...String(process.env.FRONTEND_URLS || '').split(',').map((o) => originOf(o.trim())).filter(Boolean), // more websites served by this one backend
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : []),
];

const isAllowedOrigin = (origin) =>
  !origin ||
  allowedOrigins.includes(origin) ||
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

// Express `cors` / Socket.IO compatible origin callback.
const originCallback = (origin, callback) => {
  if (isAllowedOrigin(origin)) return callback(null, true);
  return callback(new Error(`CORS blocked: ${origin}`), false);
};

// For Express: never throw (that became a 500). A disallowed origin simply gets no CORS headers, and csrfGuard
// rejects its state-changing requests with 403. Socket.IO keeps the strict version above.
const expressOriginCallback = (origin, callback) => callback(null, isAllowedOrigin(origin));

module.exports = { isAllowedOrigin, originCallback, expressOriginCallback };
