// tests/sessions.test.js
// Practice-session deletion and profile statistics (unit level: the database is a test double that applies the same
// rules). The real concurrency and MongoDB behaviour is covered by the end-to-end suite (npm run e2e).
'use strict';

jest.mock('../src/config/postgres', () => ({ prisma: {} }));
jest.mock('../src/models/mongo/UserActivity', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));

const { prisma } = require('../src/config/postgres');
const UserActivity = require('../src/models/mongo/UserActivity');
const { recomputeProfile, rebuildActivity, lockUser } = require('../src/utils/profileSync');
const { deleteSession } = require('../src/controllers/sessionController');

// In-memory stand-in for the tables, with just the operations the code uses.
function fakeDb({ sessions = [], profile = { userId: 'u1', totalSessions: 99, totalMinutes: 99, avgAccuracy: 99 } } = {}) {
  const db = { sessions: [...sessions], profile: profile ? { ...profile } : null, locks: [], log: [] };
  const tx = {
    $executeRaw: jest.fn(async (strings, ...values) => { db.locks.push(values[0]); db.log.push('lock'); return []; }),
    practiceSession: {
      aggregate: jest.fn(async ({ where }) => {
        const mine = db.sessions.filter((s) => s.userId === where.userId);
        const n = mine.length;
        return { _count: { _all: n }, _avg: { accuracy: n ? mine.reduce((a, s) => a + s.accuracy, 0) / n : null }, _sum: { duration: n ? mine.reduce((a, s) => a + s.duration, 0) : null } };
      }),
      deleteMany: jest.fn(async ({ where }) => {
        const before = db.sessions.length;
        db.sessions = db.sessions.filter((s) => !(s.id === where.id && s.userId === where.userId));
        db.log.push('delete');
        return { count: before - db.sessions.length };
      }),
    },
    userProfile: {
      updateMany: jest.fn(async ({ where, data }) => { if (db.profile && db.profile.userId === where.userId) { Object.assign(db.profile, data); return { count: 1 }; } return { count: 0 }; }),
      createMany: jest.fn(async ({ data }) => { if (!db.profile) db.profile = { ...data[0] }; return { count: 1 }; }),
    },
  };
  // A transaction runs the callback; if it throws, the changes are rolled back (restore the snapshot).
  prisma.$transaction = jest.fn(async (cb) => {
    const snapshot = JSON.stringify({ s: db.sessions, p: db.profile });
    try { return await cb(tx); } catch (err) { const r = JSON.parse(snapshot); db.sessions = r.s; db.profile = r.p; throw err; }
  });
  prisma.practiceSession.aggregate = tx.practiceSession.aggregate;
  prisma.practiceSession.findMany = jest.fn(async () => [...db.sessions].reverse());
  prisma.practiceSession.groupBy = jest.fn(async () => {
    const g = {};
    db.sessions.forEach((s) => { const x = (g[s.language] ||= { language: s.language, n: 0, acc: 0, words: 0 }); x.n += 1; x.acc += s.accuracy; x.words += s.wordsAttempted || 0; });
    return Object.values(g).map((x) => ({ language: x.language, _count: { _all: x.n }, _avg: { accuracy: x.acc / x.n }, _sum: { wordsAttempted: x.words } }));
  });
  return db;
}

const S = (id, userId, accuracy, duration, language = 'en', wordsAttempted = 10) => ({ id, userId, accuracy, duration, language, wordsAttempted, wordsCorrect: 8, createdAt: new Date(2026, 10, 1, 0, 0, Number(id.slice(1))) });

const call = async (id, userId = 'u1') => {
  const req = { params: { id }, user: { id: userId } };
  const res = { json: jest.fn() };
  const next = jest.fn();
  await deleteSession(req, res, next);
  return { res, next };
};

beforeEach(() => { jest.clearAllMocks(); UserActivity.findOneAndUpdate.mockResolvedValue({}); prisma.practiceSession = prisma.practiceSession || {}; });

describe('recomputeProfile', () => {
  it('rewrites the statistics from the remaining rows, never from the previous values', async () => {
    const db = fakeDb({ sessions: [S('s1', 'u1', 80, 600), S('s2', 'u1', 60, 300)] });
    const tx = await new Promise((r) => prisma.$transaction(async (t) => r(t)));
    const stats = await recomputeProfile(tx, 'u1');
    expect(stats).toEqual({ totalSessions: 2, totalMinutes: 15, avgAccuracy: 70 });
    expect(db.profile).toMatchObject({ totalSessions: 2, totalMinutes: 15, avgAccuracy: 70 });
  });
  it('is all zero when no sessions remain', async () => {
    const db = fakeDb({ sessions: [] });
    const tx = await new Promise((r) => prisma.$transaction(async (t) => r(t)));
    await recomputeProfile(tx, 'u1');
    expect(db.profile).toMatchObject({ totalSessions: 0, totalMinutes: 0, avgAccuracy: 0 });
  });
  it('creates the profile when it is missing', async () => {
    const db = fakeDb({ sessions: [S('s1', 'u1', 90, 120)], profile: null });
    const tx = await new Promise((r) => prisma.$transaction(async (t) => r(t)));
    await recomputeProfile(tx, 'u1');
    expect(db.profile).toMatchObject({ userId: 'u1', totalSessions: 1, totalMinutes: 2, avgAccuracy: 90 });
  });
  it('stamps lastActiveAt only when asked', async () => {
    const db = fakeDb({ sessions: [S('s1', 'u1', 90, 120)] });
    const tx = await new Promise((r) => prisma.$transaction(async (t) => r(t)));
    await recomputeProfile(tx, 'u1');
    expect(db.profile.lastActiveAt).toBeUndefined();
    await recomputeProfile(tx, 'u1', { touch: true });
    expect(db.profile.lastActiveAt).toBeInstanceOf(Date);
  });
});

describe('deleteSession', () => {
  it('deleting one of several sessions recalculates count, minutes and average from the rest', async () => {
    const db = fakeDb({ sessions: [S('s1', 'u1', 100, 600), S('s2', 'u1', 50, 1200), S('s3', 'u1', 90, 60)] });
    const { res, next } = await call('s2');
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Session deleted' }); // response format unchanged
    expect(db.profile).toMatchObject({ totalSessions: 2, totalMinutes: 11, avgAccuracy: 95 }); // (100+90)/2, 660 s -> 11 min
  });

  it('deleting the final session leaves zeros, not stale numbers', async () => {
    const db = fakeDb({ sessions: [S('s1', 'u1', 77, 900)] });
    await call('s1');
    expect(db.sessions).toHaveLength(0);
    expect(db.profile).toMatchObject({ totalSessions: 0, totalMinutes: 0, avgAccuracy: 0 });
  });

  it('works when the profile row is missing (it is created with the right numbers)', async () => {
    const db = fakeDb({ sessions: [S('s1', 'u1', 60, 60), S('s2', 'u1', 80, 120)], profile: null });
    await call('s1');
    expect(db.profile).toMatchObject({ totalSessions: 1, totalMinutes: 2, avgAccuracy: 80 });
  });

  it('repairs an inconsistent profile (wrong numbers before the delete)', async () => {
    const db = fakeDb({ sessions: [S('s1', 'u1', 50, 60), S('s2', 'u1', 70, 60)], profile: { userId: 'u1', totalSessions: 40, totalMinutes: 4000, avgAccuracy: 12 } });
    await call('s1');
    expect(db.profile).toMatchObject({ totalSessions: 1, totalMinutes: 1, avgAccuracy: 70 });
  });

  it("another user's session is not found, nothing is deleted and the owner's statistics are untouched", async () => {
    const db = fakeDb({ sessions: [S('s1', 'u1', 80, 600)], profile: { userId: 'u1', totalSessions: 1, totalMinutes: 10, avgAccuracy: 80 } });
    const { res, next } = await call('s1', 'intruder');
    expect(res.json).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 404 });
    expect(db.sessions).toHaveLength(1);
    expect(db.profile).toMatchObject({ totalSessions: 1, totalMinutes: 10, avgAccuracy: 80 });
    expect(UserActivity.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('a repeated or concurrent delete of the same session is a 404 the second time and changes nothing more', async () => {
    const db = fakeDb({ sessions: [S('s1', 'u1', 80, 600), S('s2', 'u1', 40, 600)] });
    const first = await call('s1');
    const second = await call('s1');
    expect(first.res.json).toHaveBeenCalled();
    expect(second.next.mock.calls[0][0]).toMatchObject({ statusCode: 404 });
    expect(db.profile).toMatchObject({ totalSessions: 1, totalMinutes: 10, avgAccuracy: 40 });
  });

  it('takes the user lock before touching the rows (so concurrent changes are serialised)', async () => {
    const db = fakeDb({ sessions: [S('s1', 'u1', 80, 600)] });
    await call('s1');
    expect(db.log.slice(0, 2)).toEqual(['lock', 'delete']);
    expect(db.locks).toEqual(['practice-stats:u1']);
  });

  it('a failed recompute rolls the whole delete back', async () => {
    const db = fakeDb({ sessions: [S('s1', 'u1', 80, 600)] });
    const original = prisma.$transaction.getMockImplementation();
    prisma.$transaction = jest.fn(async (cb) => original(async (tx) => { tx.userProfile.updateMany = jest.fn(async () => { throw new Error('db down'); }); return cb(tx); }));
    const { next } = await call('s1');
    expect(next).toHaveBeenCalled();
    expect(db.sessions).toHaveLength(1); // the delete was rolled back with it
  });

  it('a MongoDB failure does not undo or fail the deletion', async () => {
    const db = fakeDb({ sessions: [S('s1', 'u1', 80, 600), S('s2', 'u1', 60, 600)] });
    UserActivity.findOneAndUpdate.mockRejectedValue(new Error('mongo down'));
    const { res, next } = await call('s1');
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
    expect(db.profile.totalSessions).toBe(1);
  });
});

describe('rebuildActivity (MongoDB reconciliation)', () => {
  it('sets the derived fields from PostgreSQL instead of decrementing them', async () => {
    fakeDb({ sessions: [S('s1', 'u1', 90, 120, 'fr', 20), S('s2', 'u1', 70, 180, 'fr', 10), S('s3', 'u1', 50, 60, 'es', 5)] });
    const stats = await rebuildActivity('u1', { prisma, UserActivity });
    expect(stats).toEqual({ totalSessions: 3, totalMinutes: 6, avgAccuracy: 70 });
    const [filter, update, options] = UserActivity.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ userId: 'u1' });
    expect(options).toEqual({ upsert: true });
    expect(update.$inc).toBeUndefined();
    expect(update.$set).toMatchObject({ totalSessions: 3, totalMinutes: 6 });
    expect(update.$set.languageProgress.fr).toMatchObject({ sessionsCompleted: 2, avgAccuracy: 80, totalWords: 30 });
    expect(update.$set.languageProgress.es).toMatchObject({ sessionsCompleted: 1, totalWords: 5 });
    expect(update.$set.recentSessions.map((r) => r.sessionId)).toEqual(['s1', 's2', 's3']);
    expect(update.$set.streak).toBeUndefined(); // streak, weekly stats and badges are not touched
  });
  it('with no sessions left it writes zeros and an empty history', async () => {
    fakeDb({ sessions: [] });
    await rebuildActivity('u1', { prisma, UserActivity });
    expect(UserActivity.findOneAndUpdate.mock.calls[0][1].$set).toEqual({ totalSessions: 0, totalMinutes: 0, recentSessions: [], languageProgress: {} });
  });
  it('keeps only the 50 most recent sessions', async () => {
    fakeDb({ sessions: Array.from({ length: 60 }, (_, i) => S(`s${i + 1}`, 'u1', 80, 60)) });
    prisma.practiceSession.findMany = jest.fn(async ({ take }) => Array.from({ length: take }, (_, i) => S(`s${60 - i}`, 'u1', 80, 60)));
    await rebuildActivity('u1', { prisma, UserActivity });
    expect(UserActivity.findOneAndUpdate.mock.calls[0][1].$set.recentSessions).toHaveLength(50);
  });
});

describe('lockUser', () => {
  it('takes a transaction-level advisory lock keyed by the user', async () => {
    const tx = { $executeRaw: jest.fn(async () => 0) };
    await lockUser(tx, 'u9');
    expect(tx.$executeRaw.mock.calls[0][0].join('')).toMatch(/pg_advisory_xact_lock\(hashtext\(/);
    expect(tx.$executeRaw.mock.calls[0][1]).toBe('practice-stats:u9');
  });
});
