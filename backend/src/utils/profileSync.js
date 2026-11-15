// src/utils/profileSync.js
// Keeps practice statistics correct. PostgreSQL practice_sessions rows are the source of truth:
//   * recomputeProfile() rewrites the user's profile statistics from those rows INSIDE the caller's transaction, after
//     taking a row lock on the user, so a create and a delete running at the same time are applied one after the other
//     and the profile always ends up matching the rows. Statistics are never incremented or decremented.
//   * rebuildActivity() rebuilds the derived parts of the MongoDB activity document from the same rows.
'use strict';

const { profileStats } = require('./stats');

// Serialises concurrent changes to one user's sessions with a transaction-level advisory lock keyed by the user id. It is
// released automatically at commit or rollback, needs no table or schema name (an unqualified table name would be looked
// up in the wrong schema when a test or deployment uses a non-default one), and does not block inserts or reads.
async function lockUser(tx, userId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'practice-stats:' + userId}))`;
}

// Recomputes totalSessions, totalMinutes and avgAccuracy from the remaining rows. Works with no sessions left (all zero)
// and with a missing profile row (it is created). `touch` also stamps lastActiveAt (used when a session is added).
async function recomputeProfile(tx, userId, { touch = false } = {}) {
  const agg = await tx.practiceSession.aggregate({
    where: { userId }, _count: { _all: true }, _avg: { accuracy: true }, _sum: { duration: true },
  });
  const stats = profileStats({ count: agg._count._all, avgAccuracy: agg._avg.accuracy, sumDuration: agg._sum.duration });
  const data = touch ? { ...stats, lastActiveAt: new Date() } : stats;
  const updated = await tx.userProfile.updateMany({ where: { userId }, data });
  if (updated.count === 0) {
    // No profile yet: create it (skipDuplicates cannot abort the transaction if another request created it first).
    await tx.userProfile.createMany({ data: [{ userId, ...data }], skipDuplicates: true });
    await tx.userProfile.updateMany({ where: { userId }, data });
  }
  return stats;
}

const levelFor = (n) => (n < 5 ? 'beginner' : n < 20 ? 'intermediate' : 'advanced');

// Rebuilds the derived fields of the MongoDB UserActivity document (totals, recent sessions, per-language progress)
// from PostgreSQL. Streak, weekly stats and badges describe days practised, so deleting a record does not undo them and
// they are left alone. Safe to run repeatedly. Returns the PostgreSQL statistics it wrote.
async function rebuildActivity(userId, { prisma, UserActivity }) {
  const [agg, recent, byLanguage] = await Promise.all([
    prisma.practiceSession.aggregate({ where: { userId }, _count: { _all: true }, _avg: { accuracy: true }, _sum: { duration: true } }),
    prisma.practiceSession.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 }),
    prisma.practiceSession.groupBy({ by: ['language'], where: { userId }, _count: { _all: true }, _avg: { accuracy: true }, _sum: { wordsAttempted: true } }),
  ]);
  const stats = profileStats({ count: agg._count._all, avgAccuracy: agg._avg.accuracy, sumDuration: agg._sum.duration });

  const languageProgress = {};
  byLanguage.forEach((g) => {
    languageProgress[g.language] = {
      sessionsCompleted: g._count._all, avgAccuracy: Math.round((g._avg.accuracy || 0) * 100) / 100,
      totalWords: g._sum.wordsAttempted || 0, level: levelFor(g._count._all),
    };
  });
  const recentSessions = recent.reverse().map((s) => ({
    sessionId: s.id, language: s.language, avgAccuracy: s.accuracy, accuracyHistory: [s.accuracy], peakAccuracy: s.accuracy,
    wordsAttempted: s.wordsAttempted, wordsCorrect: s.wordsCorrect, duration: s.duration, startedAt: s.createdAt, completedAt: s.createdAt,
  }));

  await UserActivity.findOneAndUpdate(
    { userId },
    { $set: { totalSessions: stats.totalSessions, totalMinutes: stats.totalMinutes, recentSessions, languageProgress } },
    { upsert: true },
  );
  return stats;
}

module.exports = { lockUser, recomputeProfile, rebuildActivity, levelFor };
