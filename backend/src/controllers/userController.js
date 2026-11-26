// src/controllers/userController.js
'use strict';

const { prisma } = require('../config/postgres');
const UserActivity = require('../models/mongo/UserActivity');
const { AppError } = require('../middleware/errorMiddleware');
const { activeLanguages } = require('../config/languages');

const getMe = async (req, res, next) => {
  try {
    // Two different databases, so ask both at once. The activity document is non-fatal if MongoDB is unreachable.
    const [user, activity] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user.id }, include: { profile: true } }),
      UserActivity.findOne({ userId: req.user.id }).lean().catch(() => null),
    ]);
    if (!user) throw new AppError('User not found', 404);

    const { passwordHash, ...safeUser } = user;
    res.json({ success: true, data: { user: safeUser, activity } });
  } catch (error) {
    next(error);
  }
};


// PATCH /users/profile: the person's native language and the languages they are learning.
// Validated (only supported codes, no duplicates, a sane count) and created on demand, so an account that somehow has
// no profile row (older sign-ups, a failed first write) can still save preferences instead of getting a 500.
const updateProfile = async (req, res, next) => {
  try {
    const { nativeLanguage, targetLanguages } = req.body || {};
    const data = { lastActiveAt: new Date() };

    const valid = new Set((await activeLanguages(prisma)).map((l) => l.code)); // the same list the Languages admin page controls
    if (nativeLanguage !== undefined) {
      if (typeof nativeLanguage !== 'string' || !valid.has(nativeLanguage)) throw new AppError('Choose one of the supported native languages.', 400, 'INVALID_LANGUAGE');
      data.nativeLanguage = nativeLanguage;
    }
    if (targetLanguages !== undefined) {
      if (!Array.isArray(targetLanguages) || targetLanguages.some((c) => typeof c !== 'string')) throw new AppError('Choose languages from the supported list.', 400, 'INVALID_LANGUAGE');
      // A language an admin has since switched off is simply dropped, so someone can still save the rest.
      data.targetLanguages = [...new Set(targetLanguages.filter((c) => valid.has(c)))];
    }

    const profile = await prisma.userProfile.upsert({
      where: { userId: req.user.id },
      update: data,
      create: { userId: req.user.id, nativeLanguage: data.nativeLanguage || 'en', targetLanguages: data.targetLanguages || [] },
    });
    res.json({ success: true, data: { profile } });
  } catch (error) {
    next(error);
  }
};

const getLeaderboard = async (req, res, next) => {
  try {
    const entries = await UserActivity.getLeaderboard(10).lean();
    const users = await prisma.user.findMany({
      where: { id: { in: entries.map((e) => e.userId) } },
      select: { id: true, username: true },
    });
    const names = new Map(users.map((u) => [u.id, u.username]));
    // Skip stale activity records whose account was deleted, instead of showing a nameless "Learner".
    const leaderboard = entries.filter((e) => names.has(e.userId)).map((e) => ({ ...e, username: names.get(e.userId) }));
    res.json({ success: true, data: { leaderboard } });
  } catch (error) {
    next(error);
  }
};

module.exports = { getMe, updateProfile, getLeaderboard };
