// src/config/cors.js
// Single source of truth for which browser origins may call the API and Socket.IO.
'use strict';

const devOrigins = [3000, 3001, 5500, 5173, 8080].flatMap((p) => [
  `http://localhost:${p}`,
  `http://127.0.0.1:${p}`,
]);

const allowedOrigins = [
  ...devOrigins,
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

module.exports = { isAllowedOrigin, originCallback };
