// src/config/frontends.js
// One backend can serve more than one website (for example two separate Vercel deployments). FRONTEND_URL is the main
// one; FRONTEND_URLS adds the others (comma-separated). Everything that sends someone back to a website (the Google
// sign-in redirect, links in emails) goes to the site the request came from, as long as that site is on the list.
'use strict';

const { isAllowedOrigin } = require('./cors');

const DEFAULT_DEV = 'http://localhost:5173';
const originOf = (u) => { try { return new URL(u).origin; } catch { return null; } };

const configured = () => [
  originOf(process.env.FRONTEND_URL),
  ...String(process.env.FRONTEND_URLS || '').split(',').map((s) => originOf(s.trim())),
].filter(Boolean);

const defaultFrontend = () => configured()[0] || DEFAULT_DEV;

// The site a request came from (the Origin header, or the Referer when there is no Origin).
const originFromRequest = (req) => originOf(req && req.headers && (req.headers.origin || req.headers.referer));

// A candidate site is used only when it is allowed; anything else falls back to the main site.
const frontendFor = (candidate) => {
  const origin = originOf(candidate);
  return origin && isAllowedOrigin(origin) ? origin : defaultFrontend();
};

// Google must be told the same callback address when sign-in starts and when it returns. With one website that is just
// GOOGLE_CALLBACK_URL. With several (FRONTEND_URLS set), each website gets its own callback on its own address
// (<site>/api/v1/auth/google/callback), so the login cookies are set on the site the person is actually using.
// Every one of those addresses must also be added to the Google Cloud console.
const googleCallbackFor = (candidate) => {
  const base = process.env.GOOGLE_CALLBACK_URL;
  if (!base || configured().length < 2) return base; // single website: unchanged
  let path;
  try { path = new URL(base).pathname; } catch { return base; }
  return `${frontendFor(candidate)}${path}`;
};

module.exports = { defaultFrontend, originFromRequest, frontendFor, configured, googleCallbackFor };
