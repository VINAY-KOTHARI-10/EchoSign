// Wraps a Prisma client so a query that fails with a transient connection error (the database closed an idle
// connection, a brief network blip) is retried a few times. Used by the e2e helpers, never by the app itself.
'use strict';

const TRANSIENT = new Set(['P1017', 'P1001', 'P1002', 'P2024']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function retry(fn, tries = 5) {
  for (let attempt = 1; ; attempt += 1) {
    try { return await fn(); } catch (err) {
      if (attempt >= tries || !TRANSIENT.has(err.code)) throw err;
      await sleep(1000 * attempt);
    }
  }
}

const withRetry = (target) => new Proxy(target, {
  get(t, key) {
    const value = t[key];
    if (typeof value === 'function') return (...args) => retry(() => value.apply(t, args));
    if (value && typeof value === 'object' && !(value instanceof Date)) return withRetry(value);
    return value;
  },
});

module.exports = { withRetry, retry };
