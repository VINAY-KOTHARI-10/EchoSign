// src/controllers/peopleController.js
// The People directory: find people, see their profile, and (admins only) edit it.
//   admin   – everyone, with email and sign-up status, and can edit a profile
//   teacher – the students who have joined one of their own classes (name, languages, practice figures, their classes with
//             this teacher). No email addresses, and no editing.
// Everyone else is refused. The rules live here and in config/permissions.js ('people.view', 'people.edit').
'use strict';

const { prisma } = require('../config/postgres');
const { AppError } = require('../middleware/errorMiddleware');
const { activeLanguages } = require('../config/languages');
const { cleanUsername, cleanBio, cleanLanguages } = require('../utils/profileInput');
const audit = require('../Services/auditService');
const bcrypt = require('bcryptjs');
const { passwordProblem } = require('../utils/passwordPolicy');

const DAY = 24 * 3600 * 1000;
const isAdmin = (u) => u.role === 'ADMIN';

const PROFILE_FIELDS = { nativeLanguage: true, targetLanguages: true, teachingLanguages: true, totalSessions: true, totalMinutes: true, avgAccuracy: true, streak: true, lastActiveAt: true, bio: true };

// The ids of the students a teacher may look at: people who joined at least one class this teacher hosts.
async function studentIdsOf(teacher) {
  const classes = await prisma.classroom.findMany({ where: { hostId: teacher.id }, select: { id: true } });
  if (!classes.length) return { classIds: [], userIds: [] };
  const classIds = classes.map((c) => c.id);
  const members = await prisma.classroomMember.findMany({ where: { classroomId: { in: classIds } }, distinct: ['userId'], select: { userId: true } });
  return { classIds, userIds: members.map((m) => m.userId).filter((id) => id !== teacher.id) };
}

const shapePerson = (u, admin) => ({
  id: u.id,
  username: u.username,
  role: u.role === 'MODERATOR' ? 'USER' : u.role,
  createdAt: u.createdAt,
  ...(admin ? { email: u.email, emailVerified: u.emailVerified } : {}),
  profile: u.profile ? {
    nativeLanguage: u.profile.nativeLanguage, targetLanguages: u.profile.targetLanguages, teachingLanguages: u.profile.teachingLanguages || [], totalSessions: u.profile.totalSessions,
    totalMinutes: u.profile.totalMinutes, avgAccuracy: Math.round(u.profile.avgAccuracy), streak: u.profile.streak, lastActiveAt: u.profile.lastActiveAt, bio: u.profile.bio ?? null,
  } : null,
});

const SORTS = {
  name: { orderBy: [{ username: 'asc' }] },
  recent: { orderBy: [{ profile: { lastActiveAt: 'desc' } }, { username: 'asc' }] },
  accuracy: { orderBy: [{ profile: { avgAccuracy: 'desc' } }, { username: 'asc' }] },
  sessions: { orderBy: [{ profile: { totalSessions: 'desc' } }, { username: 'asc' }] },
  joined: { orderBy: [{ createdAt: 'desc' }] },
};

// GET /people?q&role&language&activity&verified&sort&page&limit
const listPeople = async (req, res, next) => {
  try {
    const admin = isAdmin(req.user);
    const q = String(req.query.q || '').trim().slice(0, 60);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const sort = SORTS[req.query.sort] ? req.query.sort : 'name';

    const AND = [];
    if (admin) {
      const role = String(req.query.role || '');
      if (['USER', 'TEACHER', 'ADMIN'].includes(role)) AND.push({ role: role === 'USER' ? { in: ['USER', 'MODERATOR'] } : role });
      if (req.query.verified === 'yes') AND.push({ emailVerified: true });
      if (req.query.verified === 'no') AND.push({ emailVerified: false });
    } else {
      const { userIds } = await studentIdsOf(req.user);
      AND.push({ id: { in: userIds } }, { role: { in: ['USER', 'MODERATOR'] } });
    }
    if (q) AND.push({ OR: [{ username: { contains: q, mode: 'insensitive' } }, ...(admin ? [{ email: { contains: q, mode: 'insensitive' } }] : [])] });
    const language = String(req.query.language || '').slice(0, 10);
    if (language) AND.push({ profile: { is: { targetLanguages: { has: language } } } });
    const teaches = String(req.query.teaches || '').slice(0, 10);
    if (teaches) AND.push({ profile: { is: { teachingLanguages: { has: teaches } } } });
    const activity = String(req.query.activity || '');
    if (activity === '7') AND.push({ profile: { is: { lastActiveAt: { gte: new Date(Date.now() - 7 * DAY) } } } });
    if (activity === '30') AND.push({ profile: { is: { lastActiveAt: { gte: new Date(Date.now() - 30 * DAY) } } } });
    if (activity === 'inactive') AND.push({ OR: [{ profile: { is: { lastActiveAt: { lt: new Date(Date.now() - 30 * DAY) } } } }, { profile: { is: null } }] });
    const where = AND.length ? { AND } : {};

    const [rows, total, byRole] = await Promise.all([
      prisma.user.findMany({ where, ...SORTS[sort], skip: (page - 1) * limit, take: limit, include: { profile: { select: PROFILE_FIELDS } } }),
      prisma.user.count({ where }),
      admin ? prisma.user.groupBy({ by: ['role'], _count: { _all: true } }) : Promise.resolve(null),
    ]);

    const counts = byRole ? byRole.reduce((acc, r) => { const k = r.role === 'MODERATOR' ? 'USER' : r.role; acc[k] = (acc[k] || 0) + r._count._all; return acc; }, {}) : null;
    res.json({ success: true, data: { people: rows.map((u) => shapePerson(u, admin)), total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)), counts, scope: admin ? 'everyone' : 'my-students' } });
  } catch (error) {
    next(error);
  }
};

// Who may see this person: an admin sees anyone; a teacher only a student from their own classes.
async function loadVisible(req, id) {
  const admin = isAdmin(req.user);
  const user = await prisma.user.findUnique({ where: { id }, include: { profile: { select: PROFILE_FIELDS } } });
  if (!user) throw new AppError('Person not found', 404);
  let scope = null;
  if (!admin) {
    scope = await studentIdsOf(req.user);
    if (!scope.userIds.includes(id)) throw new AppError('You can only view students from your own classes.', 403, 'FORBIDDEN');
  }
  return { user, admin, scope };
}

// GET /people/:id
const getPerson = async (req, res, next) => {
  try {
    const { user, admin, scope } = await loadVisible(req, String(req.params.id));
    const sessions = await prisma.practiceSession.findMany({
      where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, language: true, accuracy: true, duration: true, createdAt: true },
    });
    const memberWhere = admin ? { userId: user.id } : { userId: user.id, classroomId: { in: scope.classIds } };
    const memberships = await prisma.classroomMember.findMany({
      where: memberWhere, orderBy: { lastSeenAt: 'desc' }, take: 12,
      include: { classroom: { select: { title: true, code: true, active: true, createdAt: true } } },
    });
    const hosted = ['TEACHER', 'ADMIN'].includes(user.role) && admin ? await prisma.classroom.count({ where: { hostId: user.id } }) : null;

    res.json({
      success: true,
      data: {
        person: shapePerson(user, admin),
        recentSessions: sessions,
        classes: memberships.map((m) => ({ title: m.classroom.title, code: m.classroom.code, active: m.classroom.active, role: m.role, joins: m.joins, minutes: Math.round(m.totalSeconds / 60), lastSeenAt: m.lastSeenAt })),
        hostedClasses: hosted,
        canEdit: admin,
      },
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /people/:id  (admin only): username, about-me and languages
const updatePerson = async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true } });
    if (!target) throw new AppError('Person not found', 404);
    const body = req.body || {};
    const userData = {}; const profileData = {};
    if (body.username !== undefined) userData.username = cleanUsername(body.username);
    if (body.bio !== undefined) profileData.bio = cleanBio(body.bio);
    const valid = new Set((await activeLanguages(prisma)).map((l) => l.code));
    Object.assign(profileData, cleanLanguages(body, valid));
    if (profileData.teachingLanguages && !['TEACHER', 'ADMIN'].includes((await prisma.user.findUnique({ where: { id }, select: { role: true } })).role)) delete profileData.teachingLanguages;

    try {
      if (Object.keys(userData).length) await prisma.user.update({ where: { id }, data: userData });
      if (Object.keys(profileData).length) await prisma.userProfile.upsert({ where: { userId: id }, update: profileData, create: { userId: id, ...profileData } });
    } catch (err) {
      if (err.code === 'P2002') throw new AppError('That username is already taken.', 409, 'USERNAME_TAKEN');
      throw err;
    }
    await audit.record({ actor: req.user, action: 'user.profile_edit', targetType: 'user', targetId: id, meta: { fields: [...Object.keys(userData), ...Object.keys(profileData)], from: userData.username ? target.username : undefined, to: userData.username }, ip: req.ip });
    req.params.id = id;
    return getPerson(req, res, next);
  } catch (error) {
    next(error);
  }
};

// POST /people  (admin only): create an account with a role and a first password to hand over.
// The address is marked verified (an admin is vouching for it) so the person can sign in straight away and change the password.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const createPerson = async (req, res, next) => {
  try {
    const body = req.body || {};
    const username = cleanUsername(body.username);
    const email = String(body.email || '').trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 120) throw new AppError('Enter a valid email address.', 400, 'INVALID_EMAIL');
    const role = ['USER', 'TEACHER', 'ADMIN'].includes(body.role) ? body.role : 'USER';
    const problem = passwordProblem(body.password, email);
    if (problem) throw new AppError(problem, 400, 'WEAK_PASSWORD');
    const valid = new Set((await activeLanguages(prisma)).map((l) => l.code));
    const langs = cleanLanguages({ nativeLanguage: body.nativeLanguage || 'en' }, valid);

    const clash = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] }, select: { email: true } });
    if (clash) throw new AppError(clash.email === email ? 'That email is already registered.' : 'That username is already taken.', 409, 'DUPLICATE_USER');

    const passwordHash = await bcrypt.hash(String(body.password), 12);
    let user;
    try {
      user = await prisma.user.create({ data: { email, username, passwordHash, role, emailVerified: true, profile: { create: { nativeLanguage: langs.nativeLanguage || 'en', targetLanguages: [] } } }, include: { profile: { select: PROFILE_FIELDS } } });
    } catch (err) {
      if (err.code === 'P2002') throw new AppError('That email or username is already in use.', 409, 'DUPLICATE_USER');
      throw err;
    }
    await audit.record({ actor: req.user, action: 'user.create', targetType: 'user', targetId: user.id, meta: { role, email }, ip: req.ip });
    res.status(201).json({ success: true, data: { person: shapePerson(user, true) } });
  } catch (error) {
    next(error);
  }
};

module.exports = { listPeople, getPerson, updatePerson, createPerson };
