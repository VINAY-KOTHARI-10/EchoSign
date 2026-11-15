// src/utils/codeGuess.js
// A class code is an invitation, so guessing codes must be hard. Each wrong code costs the person a point;
// after too many misses they wait. Shared by the REST lookup and the socket join.
'use strict';

const { RateLimiterMemory } = require('rate-limiter-flexible');

const misses = new RateLimiterMemory({ keyPrefix: 'code_miss', points: 12, duration: 10 * 60 });

// Throws-free helpers. blocked() -> seconds to wait (0 = fine). miss() records a wrong code.
const blockedFor = async (userId) => {
  const r = await misses.get(String(userId));
  return r && r.remainingPoints <= 0 ? Math.max(1, Math.ceil(r.msBeforeNext / 1000)) : 0;
};
const recordMiss = async (userId) => { try { await misses.consume(String(userId)); } catch { /* already blocked */ } };
const clearMisses = (userId) => misses.delete(String(userId));

module.exports = { blockedFor, recordMiss, clearMisses };
