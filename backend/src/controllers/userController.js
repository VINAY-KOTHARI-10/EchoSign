// src/controllers/userController.js
'use strict';

const { prisma } = require('../config/postgres');
const UserActivity = require('../models/mongo/UserActivity');
const { AppError } = require('../middleware/errorMiddleware');
const { activeLanguages } = require('../config/languages');
const { cleanUsername, cleanBio, cleanLanguages } = require('../utils/profileInput');

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


// PATCH /users/profile: the person's own username, about-me, native language and the languages they are learning.
// Validated (see utils/profileInput.js) and created on demand, so an account that somehow has no profile row (older sign-ups,
// a failed first write) can still save instead of getting a 500. Any role may edit their own profile.
const updateProfile = async (req, res, next) => {
  try {
    const body = req.body || {};
    const profileData = { lastActiveAt: new Date() };
    const userData = {};
    if (body.username !== undefined) userData.username = cleanUsername(body.username);
    if (body.bio !== undefined) profileData.bio = cleanBio(body.bio);
    const valid = new Set((await activeLanguages(prisma)).map((l) => l.code)); // the same list the Languages admin page controls
    Object.assign(profileData, cleanLanguages(body, valid));
    if (body.teachingLanguages !== undefined && !['TEACHER', 'ADMIN'].includes(req.user.role)) throw new AppError('Only teachers can choose the languages they teach.', 403, 'FORBIDDEN');

    let profile;
    try {
      if (Object.keys(userData).length) await prisma.user.update({ where: { id: req.user.id }, data: userData });
      profile = await prisma.userProfile.upsert({
        where: { userId: req.user.id },
        update: profileData,
        create: { userId: req.user.id, nativeLanguage: profileData.nativeLanguage || 'en', targetLanguages: profileData.targetLanguages || [], teachingLanguages: profileData.teachingLanguages || [], bio: profileData.bio ?? null },
      });
    } catch (err) {
      if (err.code === 'P2002') throw new AppError('That username is already taken.', 409, 'USERNAME_TAKEN');
      throw err;
    }
    res.json({ success: true, data: { profile, username: userData.username } });
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
