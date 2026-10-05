// src/routes/v1/adminRoutes.js
'use strict';
const { Router } = require('express');
const { authenticate, authorize } = require('../../middleware/authMiddleware');
const { prisma } = require('../../config/postgres');
const UserActivity = require('../../models/mongo/UserActivity');

const router = Router();
router.use(authenticate, authorize('ADMIN'));

// Hierarchy: ADMIN > TEACHER > USER (member). MODERATOR is legacy and kept only so old accounts still work.
const ROLES = ['USER', 'TEACHER', 'ADMIN', 'MODERATOR'];
const pageParams = (req, maxLimit = 100) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

// GET /api/v1/admin/users?page&limit&search&role
router.get('/users', async (req, res, next) => {
  try {
    const { page, limit, skip } = pageParams(req);
    const { search, role } = req.query;
    const where = {
      ...(role && ROLES.includes(role) ? { role } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { username: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, skip, take: limit,
        select: {
          id: true, email: true, username: true, role: true, createdAt: true, emailVerified: true,
          profile: { select: { totalSessions: true, avgAccuracy: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);
    res.json({
      success: true,
      data: { users, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
});

// PATCH /api/v1/admin/users/:id/role
router.patch('/users/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!ROLES.includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }
    if (req.params.id === req.user.id && role !== 'ADMIN') {
      return res.status(400).json({ success: false, error: 'You cannot remove your own admin role' });
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, email: true, role: true },
    });
    res.json({ success: true, data: { user } });
  } catch (err) { next(err); }
});

// DELETE /api/v1/admin/users/:id
router.delete('/users/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ success: false, error: 'You cannot delete your own account' });
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'User deleted' });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/sessions?page&limit&language
router.get('/sessions', async (req, res, next) => {
  try {
    const { page, limit, skip } = pageParams(req);
    const q = String(req.query.q || '').trim().slice(0, 100);
    const where = {
      ...(req.query.language ? { language: req.query.language } : {}),
      ...(q ? { user: { OR: [
        { username: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ] } } : {}),
    };
    const [sessions, total] = await Promise.all([
      prisma.practiceSession.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, username: true, email: true } } },
      }),
      prisma.practiceSession.count({ where }),
    ]);
    res.json({
      success: true,
      data: { sessions, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/classrooms?page&limit&active
router.get('/classrooms', async (req, res, next) => {
  try {
    const { page, limit, skip } = pageParams(req);
    const q = String(req.query.q || '').trim().slice(0, 100);
    const where = {
      ...(req.query.active === undefined || req.query.active === '' ? {} : { active: req.query.active === 'true' }),
      ...(q ? { OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { code: { contains: q.toUpperCase() } },
        { host: { username: { contains: q, mode: 'insensitive' } } },
      ] } : {}),
    };
    const [classrooms, total] = await Promise.all([
      prisma.classroom.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          host: { select: { id: true, username: true, email: true } },
          _count: { select: { captions: true } },
        },
      }),
      prisma.classroom.count({ where }),
    ]);
    res.json({
      success: true,
      data: { classrooms, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/stats
router.get('/stats', async (req, res, next) => {
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      userCount, adminCount, teacherCount, newUsersWeek, sessionCount, sessionsToday,
      languageCount, avg, recentUsers, byLanguage, topActivity,
      classroomCount, activeClassrooms, captionCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { role: 'TEACHER' } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.practiceSession.count(),
      prisma.practiceSession.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.language.count(),
      prisma.practiceSession.aggregate({ _avg: { accuracy: true } }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' }, take: 5,
        select: { id: true, username: true, email: true, role: true, createdAt: true },
      }),
      prisma.practiceSession.groupBy({ by: ['language'], _count: { _all: true }, orderBy: { _count: { language: 'desc' } } }),
      UserActivity.getLeaderboard(5).catch(() => []),
      prisma.classroom.count(),
      prisma.classroom.count({ where: { active: true } }),
      prisma.caption.count(),
    ]);
    res.json({
      success: true,
      data: {
        userCount, adminCount, teacherCount, newUsersWeek, sessionCount, sessionsToday, languageCount,
        classroomCount, activeClassrooms, captionCount,
        avgAccuracy: Math.round((avg._avg.accuracy || 0) * 10) / 10,
        recentUsers,
        sessionsByLanguage: byLanguage.map((r) => ({ language: r.language, count: r._count._all })),
        topActivity,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/languages  (includes inactive ones)
router.get('/languages', async (req, res, next) => {
  try {
    const languages = await prisma.language.findMany({ orderBy: { name: 'asc' } });
    res.json({ success: true, data: { languages } });
  } catch (err) { next(err); }
});

// PATCH /api/v1/admin/languages/:id
router.patch('/languages/:id', async (req, res, next) => {
  try {
    const { code, name, flag, active } = req.body;
    const language = await prisma.language.update({
      where: { id: req.params.id },
      data: {
        ...(code !== undefined && { code }),
        ...(name !== undefined && { name }),
        ...(flag !== undefined && { flag }),
        ...(active !== undefined && { active: Boolean(active) }),
      },
    });
    res.json({ success: true, data: { language } });
  } catch (err) { next(err); }
});

// DELETE /api/v1/admin/languages/:id
router.delete('/languages/:id', async (req, res, next) => {
  try {
    await prisma.language.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Language deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
