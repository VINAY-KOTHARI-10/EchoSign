// src/controllers/classroomController.js
// Classroom captioning sessions: a teacher hosts a room, students join by code.
'use strict';

const crypto = require('crypto');
const { prisma } = require('../config/postgres');
const { AppError } = require('../middleware/errorMiddleware');
const { chatJSON } = require('../utils/groq');
const logger = require('../utils/logger');

// No 0/O/1/I so codes are easy to read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () =>
  Array.from(crypto.randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

const include = { host: { select: { id: true, username: true } }, _count: { select: { captions: true } } };

const publicClassroom = (c) => ({
  id: c.id,
  code: c.code,
  title: c.title,
  language: c.language,
  active: c.active,
  createdAt: c.createdAt,
  endedAt: c.endedAt,
  scheduledAt: c.scheduledAt,
  keywords: c.keywords || [],
  host: c.host ? { id: c.host.id, username: c.host.username } : undefined,
  captionCount: c._count?.captions,
});

const findByCode = async (code) => {
  const classroom = await prisma.classroom.findUnique({
    where: { code: String(code || '').toUpperCase() },
    include,
  });
  if (!classroom) throw new AppError('Classroom not found', 404);
  return classroom;
};

// HOST | CAPTIONER | STUDENT for this user in this classroom. Site admins act as hosts.
const roleOf = async (classroom, user) => {
  if (classroom.hostId === user.id || user.role === 'ADMIN') return 'HOST';
  const m = await prisma.classroomMember.findUnique({
    where: { classroomId_userId: { classroomId: classroom.id, userId: user.id } },
    select: { role: true },
  });
  return m?.role === 'CAPTIONER' ? 'CAPTIONER' : 'STUDENT';
};
const canModerate = (role) => role === 'HOST' || role === 'CAPTIONER';

const cleanKeywords = (list) =>
  [...new Set((Array.isArray(list) ? list : []).map((k) => String(k).trim().slice(0, 40)).filter(Boolean))].slice(0, 30);

// Custom gestures: a name, the phrase it stands for, and a few 42-number hand-shape samples.
const cleanGestures = (list) => {
  if (!Array.isArray(list)) throw new AppError('customGestures must be an array', 400);
  return list.slice(0, 20).map((g) => {
    const samples = (Array.isArray(g.samples) ? g.samples : [])
      .filter((s) => Array.isArray(s) && s.length === 42 && s.every((n) => Number.isFinite(n)))
      .slice(0, 12);
    const phrase = String(g.phrase || '').trim().slice(0, 120);
    if (!phrase || samples.length < 1) throw new AppError('Each custom gesture needs a phrase and samples', 400);
    return { id: String(g.id || crypto.randomUUID()).slice(0, 40), name: String(g.name || phrase).slice(0, 60), phrase, samples };
  });
};

// POST /classrooms
const createClassroom = async (req, res, next) => {
  try {
    // Role hierarchy: admins and teachers host classes; members can only join them.
    if (!['ADMIN', 'TEACHER'].includes(req.user.role)) {
      throw new AppError('Only teachers can start a class. Ask an administrator to give your account the Teacher role.', 403);
    }
    const title = String(req.body.title || '').trim().slice(0, 120);
    const language = String(req.body.language || 'en').slice(0, 10);
    if (!title) throw new AppError('Title is required', 400);
    const scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw new AppError('Invalid schedule time', 400);

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const classroom = await prisma.classroom.create({
          data: {
            title, language, hostId: req.user.id, code: makeCode(), scheduledAt,
            keywords: cleanKeywords(req.body.keywords),
          },
          include,
        });
        return res.status(201).json({ success: true, data: { classroom: publicClassroom(classroom) } });
      } catch (err) {
        if (err.code !== 'P2002') throw err; // retry only on a code collision
      }
    }
    throw new AppError('Could not generate a classroom code', 500);
  } catch (err) { next(err); }
};

// GET /classrooms  → rooms I host, newest first
const listMine = async (req, res, next) => {
  try {
    const rooms = await prisma.classroom.findMany({
      where: { hostId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include,
    });
    res.json({ success: true, data: { classrooms: rooms.map(publicClassroom) } });
  } catch (err) { next(err); }
};

// GET /classrooms/:code
const getClassroom = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code);
    const role = await roleOf(classroom, req.user);
    res.json({
      success: true,
      data: {
        classroom: {
          ...publicClassroom(classroom),
          customGestures: classroom.customGestures || [],
          summary: classroom.summary || null,
          summaryAt: classroom.summaryAt,
        },
        isHost: role === 'HOST',
        role,
        canModerate: canModerate(role),
      },
    });
  } catch (err) { next(err); }
};

// PATCH /classrooms/:code   (host) title, keywords, schedule, custom gestures
const updateClassroom = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code);
    if ((await roleOf(classroom, req.user)) !== 'HOST') throw new AppError('Only the host can change this classroom', 403);

    const data = {};
    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim().slice(0, 120);
      if (!title) throw new AppError('Title is required', 400);
      data.title = title;
    }
    if (req.body.keywords !== undefined) data.keywords = cleanKeywords(req.body.keywords);
    if (req.body.scheduledAt !== undefined) {
      const d = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;
      if (d && Number.isNaN(d.getTime())) throw new AppError('Invalid schedule time', 400);
      data.scheduledAt = d;
    }
    if (req.body.customGestures !== undefined) data.customGestures = cleanGestures(req.body.customGestures);

    const updated = await prisma.classroom.update({ where: { id: classroom.id }, data, include });
    req.app.get('io')?.to(`class:${classroom.id}`).emit('class:settings', {
      keywords: updated.keywords, title: updated.title, customGestures: updated.customGestures || [],
    });
    res.json({ success: true, data: { classroom: { ...publicClassroom(updated), customGestures: updated.customGestures || [] } } });
  } catch (err) { next(err); }
};

// GET /classrooms/:code/captions?limit=
const getCaptions = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code);
    const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit) || 300));
    const captions = await prisma.caption.findMany({
      where: { classroomId: classroom.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ success: true, data: { captions: captions.reverse() } });
  } catch (err) { next(err); }
};

// PATCH /classrooms/:code/captions/:id   (host, captioner, or the person who spoke it)
const editCaption = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code);
    const text = String(req.body.text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!text) throw new AppError('Caption text is required', 400);

    const caption = await prisma.caption.findFirst({ where: { id: req.params.id, classroomId: classroom.id } });
    if (!caption) throw new AppError('Caption not found', 404);
    const role = await roleOf(classroom, req.user);
    if (!canModerate(role) && caption.speakerId !== req.user.id) throw new AppError('You cannot edit this caption', 403);

    const updated = await prisma.caption.update({
      where: { id: caption.id },
      data: { text, originalText: caption.originalText ?? caption.text, editedAt: new Date(), editedById: req.user.id },
    });
    req.app.get('io')?.to(`class:${classroom.id}`).emit('class:caption:edited', updated);
    res.json({ success: true, data: { caption: updated } });
  } catch (err) { next(err); }
};

// POST /classrooms/:code/end   (host or admin)
const endClassroom = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code);
    if ((await roleOf(classroom, req.user)) !== 'HOST') throw new AppError('Only the host can end this classroom', 403);
    const updated = await prisma.classroom.update({
      where: { id: classroom.id },
      data: { active: false, endedAt: classroom.endedAt || new Date() },
      include,
    });
    req.app.get('io')?.to(`class:${classroom.id}`).emit('class:ended', { code: classroom.code });
    res.json({ success: true, data: { classroom: publicClassroom(updated) } });
  } catch (err) { next(err); }
};

// POST /classrooms/:code/reopen   (host) – same code and link, so a recurring class never needs a new invite
const reopenClassroom = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code);
    if ((await roleOf(classroom, req.user)) !== 'HOST') throw new AppError('Only the host can reopen this classroom', 403);
    const updated = await prisma.classroom.update({
      where: { id: classroom.id }, data: { active: true, endedAt: null, scheduledAt: null }, include,
    });
    res.json({ success: true, data: { classroom: publicClassroom(updated) } });
  } catch (err) { next(err); }
};

// ── Translation ──────────────────────────────────────────────────────────────
const translationCache = new Map(); // `${target}|${text}` -> translation
const translateHits = new Map();    // userId -> [timestamps] (simple per-user rate limit)

const underRateLimit = (userId, max = 40, windowMs = 60000) => {
  const now = Date.now();
  const hits = (translateHits.get(userId) || []).filter((t) => now - t < windowMs);
  hits.push(now); translateHits.set(userId, hits);
  return hits.length <= max;
};

// POST /classrooms/:code/translate  { texts: string[], target: 'Hindi' | 'hi' }
const translate = async (req, res, next) => {
  try {
    await findByCode(req.params.code);
    const target = String(req.body.target || '').trim().slice(0, 40);
    const texts = (Array.isArray(req.body.texts) ? req.body.texts : []).slice(0, 20).map((t) => String(t).slice(0, 500));
    if (!target || texts.length === 0) throw new AppError('target and texts are required', 400);
    if (!underRateLimit(req.user.id)) throw new AppError('Too many translation requests, slow down', 429);

    const out = texts.map((t) => translationCache.get(`${target}|${t}`) ?? null);
    const missing = texts.map((t, i) => (out[i] === null ? i : -1)).filter((i) => i >= 0);

    if (missing.length) {
      const result = await chatJSON(
        'You translate classroom captions. Reply ONLY with JSON: {"translations": ["..."]} — one string per input, same order, no commentary.',
        `Translate each item into ${target}.\n${JSON.stringify(missing.map((i) => texts[i]))}`,
        { maxTokens: 1500 },
      );
      if (!result) throw new AppError('Translation is not configured on this server', 503);
      const list = Array.isArray(result.translations) ? result.translations : [];
      missing.forEach((idx, k) => {
        const t = typeof list[k] === 'string' ? list[k] : texts[idx];
        out[idx] = t;
        translationCache.set(`${target}|${texts[idx]}`, t);
      });
      if (translationCache.size > 5000) translationCache.clear();
    }
    res.json({ success: true, data: { translations: out } });
  } catch (err) { next(err); }
};

// ── AI lecture summary ───────────────────────────────────────────────────────
const STOP = new Set('the a an and or but of to in on for with is are was were be been it this that as at by from we you i they he she not do does did have has had will would can could should so if then than also about into over just what which who how when where why there their our your its them these those'.split(' '));

// Used when no Groq key is set, so the feature still produces something useful.
const basicSummary = (lines) => {
  const text = lines.join(' ');
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.split(' ').length >= 5);
  const freq = {};
  text.toLowerCase().match(/[a-z][a-z'-]{3,}/g)?.forEach((w) => { if (!STOP.has(w)) freq[w] = (freq[w] || 0) + 1; });
  const terms = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([term]) => ({ term, definition: '' }));
  const step = Math.max(1, Math.floor(sentences.length / 6));
  return { notes: sentences.filter((_, i) => i % step === 0).slice(0, 6), keyTerms: terms, quiz: [], provider: 'basic' };
};

// POST /classrooms/:code/summary   (host or captioner)
const generateSummary = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code);
    if (!canModerate(await roleOf(classroom, req.user))) throw new AppError('Only the host or a captioner can generate a summary', 403);

    const captions = await prisma.caption.findMany({
      where: { classroomId: classroom.id }, orderBy: { createdAt: 'asc' }, take: 2000,
      select: { speakerName: true, text: true },
    });
    if (captions.length < 3) throw new AppError('Not enough captions to summarise yet', 400);
    const lines = captions.map((c) => c.text);
    const transcript = captions.map((c) => `${c.speakerName}: ${c.text}`).join('\n').slice(0, 14000);

    let summary = null;
    try {
      const ai = await chatJSON(
        'You write study material from a classroom transcript. Reply ONLY with JSON: {"notes": [string, ...6-10 concise bullet points], "keyTerms": [{"term": string, "definition": string}, ...up to 8], "quiz": [{"question": string, "options": [4 strings], "answerIndex": 0-3}, ...5 questions]}. Use only facts from the transcript.',
        `Class: ${classroom.title}\nKeywords: ${(classroom.keywords || []).join(', ')}\n\nTranscript:\n${transcript}`,
        { maxTokens: 2200, temperature: 0.3 },
      );
      if (ai && Array.isArray(ai.notes)) {
        summary = {
          notes: ai.notes.map(String).slice(0, 12),
          keyTerms: (ai.keyTerms || []).slice(0, 10).map((t) => ({ term: String(t.term || ''), definition: String(t.definition || '') })).filter((t) => t.term),
          quiz: (ai.quiz || []).slice(0, 8)
            .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex <= 3)
            .map((q) => ({ question: String(q.question), options: q.options.map(String), answerIndex: q.answerIndex })),
          provider: 'groq',
        };
      }
    } catch (err) { logger.warn(`Summary via Groq failed, using basic summary: ${err.message}`); }
    if (!summary) summary = basicSummary(lines);

    const stored = { ...summary, generatedAt: new Date().toISOString() };
    await prisma.classroom.update({ where: { id: classroom.id }, data: { summary: stored, summaryAt: new Date() } });
    res.json({ success: true, data: { summary: stored } });
  } catch (err) { next(err); }
};

// ── Insights + attendance (host / captioner) ─────────────────────────────────
const SPEAKING_WPM = 150; // words per minute used to estimate speaking time

// GET /classrooms/:code/insights
const getInsights = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code);
    if (!canModerate(await roleOf(classroom, req.user))) throw new AppError('Only the host or a captioner can view insights', 403);

    const [captions, members] = await Promise.all([
      prisma.caption.findMany({
        where: { classroomId: classroom.id }, orderBy: { createdAt: 'asc' },
        select: { speakerId: true, speakerName: true, source: true, text: true, createdAt: true, editedAt: true },
      }),
      prisma.classroomMember.findMany({ where: { classroomId: classroom.id }, orderBy: { firstJoinedAt: 'asc' } }),
    ]);

    const bySource = { SPEECH: 0, SIGN: 0, TEXT: 0 };
    const speakers = {};
    let corrected = 0;
    captions.forEach((c) => {
      bySource[c.source] = (bySource[c.source] || 0) + 1;
      if (c.editedAt) corrected += 1;
      const key = c.speakerId || c.speakerName;
      const s = (speakers[key] ||= { userId: c.speakerId, username: c.speakerName, captions: 0, words: 0, speechWords: 0, bySource: { SPEECH: 0, SIGN: 0, TEXT: 0 } });
      s.captions += 1; s.bySource[c.source] += 1;
      const words = c.text.split(/\s+/).filter(Boolean).length;
      s.words += words;
      if (c.source === 'SPEECH') s.speechWords += words;
    });
    const speakerList = Object.values(speakers)
      .map(({ speechWords, ...s }) => ({ ...s, estSpeakingMinutes: Math.round((speechWords / SPEAKING_WPM) * 10) / 10 }))
      .sort((a, b) => b.captions - a.captions);

    const first = captions[0]?.createdAt; const last = captions[captions.length - 1]?.createdAt;
    res.json({
      success: true,
      data: {
        totalCaptions: captions.length,
        corrected,
        bySource,
        speakers: speakerList,
        activeMinutes: first && last ? Math.round(((new Date(last) - new Date(first)) / 60000) * 10) / 10 : 0,
        attendance: members.map((m) => ({
          userId: m.userId, username: m.username,
          role: m.userId === classroom.hostId ? 'HOST' : m.role,
          joins: m.joins, minutes: Math.round(m.totalSeconds / 6) / 10,
          firstJoinedAt: m.firstJoinedAt, lastSeenAt: m.lastSeenAt,
        })),
      },
    });
  } catch (err) { next(err); }
};

// PUT /classrooms/:code/members/:userId/role  { role: 'CAPTIONER' | 'STUDENT' }   (host)
const setMemberRole = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code);
    if ((await roleOf(classroom, req.user)) !== 'HOST') throw new AppError('Only the host can change roles', 403);
    const role = req.body.role;
    if (!['CAPTIONER', 'STUDENT'].includes(role)) throw new AppError('Invalid role', 400);
    if (req.params.userId === classroom.hostId) throw new AppError('The host already has full control', 400);

    const member = await prisma.classroomMember.findUnique({
      where: { classroomId_userId: { classroomId: classroom.id, userId: req.params.userId } },
    });
    if (!member) throw new AppError('That person has not joined this class', 404);
    const updated = await prisma.classroomMember.update({ where: { id: member.id }, data: { role } });
    req.app.get('io')?.to(`class:${classroom.id}`).emit('class:role', { userId: updated.userId, role: updated.role });
    res.json({ success: true, data: { userId: updated.userId, role: updated.role } });
  } catch (err) { next(err); }
};

module.exports = {
  createClassroom, listMine, getClassroom, updateClassroom, getCaptions, editCaption,
  endClassroom, reopenClassroom, translate, generateSummary, getInsights, setMemberRole,
  publicClassroom, roleOf, canModerate,
};
