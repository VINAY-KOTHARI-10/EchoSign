// src/utils/stats.js
// PostgreSQL is the source of truth for practice statistics: they are always recomputed from the practice_sessions rows,
// never incremented in place, so a failed or repeated write can never make them drift. MongoDB (UserActivity) holds
// the document-shaped activity feed and can be rebuilt/reconciled by scripts/maintenance.js.
'use strict';

// aggregate = { count, avgAccuracy, sumDuration } from prisma.practiceSession.aggregate / SQL
const profileStats = ({ count = 0, avgAccuracy = 0, sumDuration = 0 } = {}) => ({
  totalSessions: count,
  totalMinutes: Math.round((sumDuration || 0) / 60),
  avgAccuracy: Math.round((avgAccuracy || 0) * 100) / 100,
});

module.exports = { profileStats };
