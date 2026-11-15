// src/controllers/classroomController.js
// Classroom captioning sessions: a teacher hosts a room, students join by code.
'use strict';

const crypto = require('crypto');
const { prisma } = require('../config/postgres');
const { AppError } = require('../middleware/errorMiddleware');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const { chatJSON, MODEL } = require('../utils/groq');
const logger = require('../utils/logger');
const { can } = require('../config/permissions');
const audit = require('../Services/auditService');
const codeGuess = require('../utils/codeGuess');
const { summarizeLecture, askLecture } = require('../utils/lectureAi');
const { createTranslator, validateInput } = require('../utils/translation');
const { resolveLanguage } = require('../config/languages');
const { pageCaptions } = require('../utils/captionPages');
const { prismaSource } = require('../utils/lectureSource');
const { streamTranscript } = require('../utils/transcriptStream');

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

// A class code is an invitation, so repeated wrong codes are throttled per user (see utils/codeGuess).
const findByCode = async (code, user) => {
  if (user) {
    const wait = await codeGuess.blockedFor(user.id);
    if (wait) throw new AppError(`Too many wrong codes. Try again in ${Math.ceil(wait / 60)} minute(s).`, 429, 'TOO_MANY_ATTEMPTS');
  }
  const classroom = await prisma.classroom.findUnique({
    where: { code: String(code || '').toUpperCase() },
    include,
  });
  if (!classroom) {
    if (user) await codeGuess.recordMiss(user.id);
    throw new AppError('Classroom not found', 404);
  }
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

// Reading a class's captions, notes or translations needs more than knowing its code: the person must be the host,
// an admin, or someone who has joined the class. Returns the in-class role.
const requireAccess = async (classroom, user) => {
  const role = await roleOf(classroom, user);
  if (role !== 'STUDENT') return role;
  const member = await prisma.classroomMember.findUnique({
    where: { classroomId_userId: { classroomId: classroom.id, userId: user.id } }, select: { id: true },
  });
  if (!member) throw new AppError('Join this class with its code to see its captions.', 403, 'NOT_A_MEMBER');
  return role;
};

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
    if (!can(req.user, 'class.create')) {
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
        audit.record({ actor: req.user, action: 'class.create', targetType: 'classroom', targetId: classroom.id, meta: { code: classroom.code, title }, ip: req.ip });
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
    const classroom = await findByCode(req.params.code, req.user);
    const role = await roleOf(classroom, req.user);
    // Someone who only knows the code (has not joined yet) gets the basics; notes and gestures come after joining.
    let isMember = role !== 'STUDENT';
    if (!isMember) {
      isMember = Boolean(await prisma.classroomMember.findUnique({
        where: { classroomId_userId: { classroomId: classroom.id, userId: req.user.id } }, select: { id: true },
      }));
    }
    res.json({
      success: true,
      data: {
        classroom: {
          ...publicClassroom(classroom),
          ...(isMember
            ? { customGestures: classroom.customGestures || [], summary: classroom.summary || null, summaryAt: classroom.summaryAt }
            : { customGestures: [], summary: null }),
        },
        isHost: role === 'HOST',
        isMember,
        role,
        canModerate: canModerate(role),
      },
    });
  } catch (err) { next(err); }
};

// PATCH /classrooms/:code   (host) title, keywords, schedule, custom gestures
const updateClassroom = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code, req.user);
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

// GET /classrooms/:code/captions?limit=&after=<captionId>
// Live view: the latest `limit` captions in order (hasMore says older ones exist; use /transcript for all of them),
// or, with `after`, only what came after that caption (used to catch up after a reconnect).
const getCaptions = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code, req.user);
    await requireAccess(classroom, req.user);
    const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit, 10) || 300));
    if (req.query.after) {
      const anchor = await prisma.caption.findFirst({ where: { id: String(req.query.after), classroomId: classroom.id }, select: { createdAt: true, id: true } });
      if (!anchor) return res.json({ success: true, data: { captions: [], resync: true } });
      const captions = await prisma.caption.findMany({
        where: { classroomId: classroom.id, OR: [{ createdAt: { gt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { gt: anchor.id } }] },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit,
      });
      return res.json({ success: true, data: { captions, resync: false } });
    }
    const newest = await prisma.caption.findMany({
      where: { classroomId: classroom.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
    });
    const hasMore = newest.length > limit;
    res.json({ success: true, data: { captions: newest.slice(0, limit).reverse(), hasMore } });
  } catch (err) { next(err); }
};

// POST /classrooms/:code/captions  { text, source, clientId }
// Fallback for when the socket is down: same rules and the same idempotency key as the socket path, so a retried send is stored once.
const postCaption = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code, req.user);
    if (!classroom.active) throw new AppError('This class has ended', 409, 'ENDED');
    await requireAccess(classroom, req.user);
    const text = String(req.body.text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!text) throw new AppError('Caption text is required', 400);
    const source = ['SPEECH', 'SIGN', 'TEXT'].includes(req.body.source) ? req.body.source : 'TEXT';
    const clientId = /^[A-Za-z0-9_-]{8,64}$/.test(String(req.body.clientId || '')) ? String(req.body.clientId) : null;
    try {
      const caption = await prisma.caption.create({
        data: { classroomId: classroom.id, speakerId: req.user.id, speakerName: req.user.username, source, text, clientId },
      });
      req.app.get('io')?.to(`class:${classroom.id}`).emit('class:caption', caption);
      return res.status(201).json({ success: true, data: { caption, duplicate: false } });
    } catch (err) {
      if (err.code === 'P2002' && clientId) {
        const caption = await prisma.caption.findFirst({ where: { classroomId: classroom.id, clientId } });
        return res.json({ success: true, data: { caption, duplicate: true } });
      }
      throw err;
    }
  } catch (err) { next(err); }
};

// GET /classrooms/:code/transcript?limit=&cursor=&q=&speaker=&source=&at=
// The complete transcript, oldest first, in cursor pages. Filter by keyword (q), speaker (user id) and source, and
// jump to a moment with `at` (seconds from the start of the lecture).
const getTranscript = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code, req.user);
    await requireAccess(classroom, req.user);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const where = { classroomId: classroom.id };
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q) where.text = { contains: q, mode: 'insensitive' };
    if (req.query.speaker) where.speakerId = String(req.query.speaker);
    if (['SPEECH', 'SIGN', 'TEXT'].includes(req.query.source)) where.source = req.query.source;

    const first = await prisma.caption.findFirst({ where: { classroomId: classroom.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { createdAt: true } });
    const startedAt = first ? first.createdAt : null;
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const total = await prisma.caption.count({ where });
    const at = Number(req.query.at);
    const pageWhere = { ...where };
    if (!cursor && startedAt && Number.isFinite(at) && at > 0) {
      pageWhere.createdAt = { gte: new Date(new Date(startedAt).getTime() + at * 1000) };
    }
    const rows = await prisma.caption.findMany({
      where: pageWhere, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const captions = rows.slice(0, limit);
    res.json({ success: true, data: { captions, nextCursor: hasMore ? captions[captions.length - 1].id : null, total, startedAt } });
  } catch (err) { next(err); }
};

// Writes a chunk and waits for the socket to drain, so a slow download never piles up in memory.
const writeChunk = (res, chunk) => new Promise((resolve, reject) => {
  if (res.destroyed) return reject(new Error('The download was cancelled'));
  if (res.write(chunk)) return resolve();
  res.once('drain', resolve);
  res.once('close', () => reject(new Error('The download was cancelled')));
  return undefined;
});

// GET /classrooms/:code/export?format=txt|srt|html
// Streams the COMPLETE transcript page by page (bounded memory, no cap on length). If something fails after the download
// has started the connection is dropped, so the person sees a failed download and not a file that looks complete.
const exportTranscript = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code, req.user);
    await requireAccess(classroom, req.user);
    const format = String(req.query.format || 'txt').toLowerCase();
    const safeName = classroom.title.replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || classroom.code;
    if (format === 'srt') {
      res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.srt"`);
    } else if (format === 'html' || format === 'print') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    } else {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.txt"`);
    }
    res.setHeader('Cache-Control', 'no-store');

    try {
      const kind = format === 'srt' ? 'srt' : format === 'html' || format === 'print' ? 'html' : 'txt';
      await streamTranscript({ prisma, classroom, kind, summary: classroom.summary, write: (chunk) => writeChunk(res, chunk) });
      return res.end();
    } catch (err) {
      if (!res.headersSent) throw err;      // nothing sent yet: a normal error response
      logger.error(`[${req.id}] transcript export interrupted: ${err.message}`);
      return res.destroy(err);              // already streaming: abort so the file is not mistaken for a complete one
    }
  } catch (err) { return next(err); }
};

// PATCH /classrooms/:code/captions/:id   (host, captioner, or the person who spoke it)
const editCaption = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code, req.user);
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
    const classroom = await findByCode(req.params.code, req.user);
    if ((await roleOf(classroom, req.user)) !== 'HOST') throw new AppError('Only the host can end this classroom', 403);
    const updated = await prisma.classroom.update({
      where: { id: classroom.id },
      data: { active: false, endedAt: classroom.endedAt || new Date() },
      include,
    });
    const io = req.app.get('io');
    io?.to(`class:${classroom.id}`).emit('class:ended', { code: classroom.code });
    if (io?.finalizeClass) await io.finalizeClass(classroom.id); // count the remaining attendance time and release the room
    audit.record({ actor: req.user, action: 'class.end', targetType: 'classroom', targetId: classroom.id, meta: { code: classroom.code }, ip: req.ip });
    res.json({ success: true, data: { classroom: publicClassroom(updated) } });
  } catch (err) { next(err); }
};

// POST /classrooms/:code/reopen   (host) – same code and link, so a recurring class never needs a new invite
const reopenClassroom = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code, req.user);
    if ((await roleOf(classroom, req.user)) !== 'HOST') throw new AppError('Only the host can reopen this classroom', 403);
    const updated = await prisma.classroom.update({
      where: { id: classroom.id }, data: { active: true, endedAt: null, scheduledAt: null }, include,
    });
    audit.record({ actor: req.user, action: 'class.reopen', targetType: 'classroom', targetId: classroom.id, meta: { code: classroom.code }, ip: req.ip });
    res.json({ success: true, data: { classroom: publicClassroom(updated) } });
  } catch (err) { next(err); }
};

// ── Translation ──────────────────────────────────────────────────────────────
// Batched, cached and de-duplicated (see utils/translation.js). A caption the AI could not translate comes back as null
// and its index is listed in `failed`; it is never cached and never replaced by the original text.
const translateLimiter = new RateLimiterMemory({ keyPrefix: 'translate', points: 40, duration: 60 });
const askLimiter = new RateLimiterMemory({ keyPrefix: 'ask', points: 10, duration: 60 });
const chatOrNull = () => (process.env.GROQ_API_KEY ? chatJSON : null);
const translator = createTranslator({
  chat: (system, user, opts) => (process.env.GROQ_API_KEY ? chatJSON(system, user, opts) : Promise.resolve(null)),
  logger,
});

// POST /classrooms/:code/translate  { texts: string[], target: 'Hindi' | 'hi' }
const translate = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code, req.user);
    await requireAccess(classroom, req.user);
    let input;
    try { input = validateInput({ texts: req.body.texts, target: req.body.target }, resolveLanguage); }
    catch (err) { throw new AppError(err.message, err.status || 400, 'INVALID_TRANSLATION_REQUEST'); }
    try { await translateLimiter.consume(req.user.id); } catch { throw new AppError('Too many translation requests, slow down', 429, 'RATE_LIMITED'); }

    let result;
    try { result = await translator.translate(input.language, input.texts); }
    catch (err) {
      if (err.code === 'NOT_CONFIGURED') throw new AppError('Translation is not configured on this server', 503, 'NOT_CONFIGURED');
      throw new AppError('The translation service did not answer. Try again in a moment.', 502, 'TRANSLATION_FAILED');
    }
    res.json({ success: true, data: { translations: result.translations, failed: result.failed, target: input.language } });
  } catch (err) { next(err); }
};

// ── AI lecture notes ─────────────────────────────────────────────────────────
// POST /classrooms/:code/summary   (host or captioner)
// Reads the WHOLE transcript (in chunks when it is long), stores the result with how it was made, and falls back to a
// clearly labelled non-AI summary when the AI service is unavailable.
const generateSummary = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code, req.user);
    if (!canModerate(await roleOf(classroom, req.user))) throw new AppError('Only the host or a captioner can generate a summary', 403);

    const count = await prisma.caption.count({ where: { classroomId: classroom.id } });
    if (count < 3) throw new AppError('Not enough captions to summarise yet', 400);

    // The transcript is read page by page and condensed as it arrives (see utils/lectureAi.js); nothing is held in full.
    const result = await summarizeLecture({
      classroom, chat: chatOrNull(),
      pages: pageCaptions(prisma, classroom.id, { select: { speakerName: true, text: true }, pageSize: 1000 }),
    });
    const stored = { ...result, model: result.provider === 'groq' ? MODEL : null, generatedAt: new Date().toISOString(), generatedBy: req.user.username };
    await prisma.classroom.update({ where: { id: classroom.id }, data: { summary: stored, summaryAt: new Date() } });
    res.json({ success: true, data: { summary: stored } });
  } catch (err) { next(err); }
};

// GET /classrooms/:code/summary  → saved notes, and whether the transcript has grown since they were made
const getSummary = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code, req.user);
    await requireAccess(classroom, req.user);
    const count = await prisma.caption.count({ where: { classroomId: classroom.id } });
    const summary = classroom.summary || null;
    res.json({
      success: true,
      data: {
        summary, captionCount: count,
        stale: Boolean(summary && summary.captionCount !== undefined && count > summary.captionCount),
        classroom: { code: classroom.code, title: classroom.title, teacher: classroom.host?.username, active: classroom.active, createdAt: classroom.createdAt },
      },
    });
  } catch (err) { next(err); }
};

// POST /classrooms/:code/ask  { question }
// Answers come from this class's transcript (and saved notes) only, with timestamped references.
const askAboutLecture = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code, req.user);
    await requireAccess(classroom, req.user);
    const question = String(req.body.question || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (question.length < 3) throw new AppError('Type a question about the lecture', 400);
    try { await askLimiter.consume(req.user.id); } catch { throw new AppError('You are asking too fast. Wait a few seconds.', 429); }
    const source = prismaSource(prisma, classroom.id);
    if ((await source.total()) === 0) throw new AppError('This lecture has no captions yet', 400);
    const answer = await askLecture({ classroom, source, notes: classroom.summary, question, chat: chatOrNull() });
    res.json({ success: true, data: answer });
  } catch (err) { next(err); }
};

// ── Insights + attendance (host / captioner) ─────────────────────────────────
const SPEAKING_WPM = 150; // words per minute used to estimate speaking time

// GET /classrooms/:code/insights
const getInsights = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code, req.user);
    if (!canModerate(await roleOf(classroom, req.user))) throw new AppError('Only the host or a captioner can view insights', 403);

    const members = await prisma.classroomMember.findMany({ where: { classroomId: classroom.id }, orderBy: { firstJoinedAt: 'asc' } });

    // One pass over the transcript, a page at a time: only the running totals are kept.
    const bySource = { SPEECH: 0, SIGN: 0, TEXT: 0 };
    const speakers = {};
    let corrected = 0; let totalCaptions = 0; let first = null; let last = null;
    for await (const page of pageCaptions(prisma, classroom.id, { select: { speakerId: true, speakerName: true, source: true, text: true, editedAt: true }, pageSize: 2000 })) {
      for (const c of page) {
        totalCaptions += 1;
        if (!first) first = c.createdAt;
        last = c.createdAt;
        bySource[c.source] = (bySource[c.source] || 0) + 1;
        if (c.editedAt) corrected += 1;
        const key = c.speakerId || c.speakerName;
        const s = (speakers[key] ||= { userId: c.speakerId, username: c.speakerName, captions: 0, words: 0, speechWords: 0, bySource: { SPEECH: 0, SIGN: 0, TEXT: 0 } });
        s.captions += 1; s.bySource[c.source] += 1;
        const words = c.text.split(/\s+/).filter(Boolean).length;
        s.words += words;
        if (c.source === 'SPEECH') s.speechWords += words;
      }
    }
    const speakerList = Object.values(speakers)
      .map(({ speechWords, ...s }) => ({ ...s, estSpeakingMinutes: Math.round((speechWords / SPEAKING_WPM) * 10) / 10 }))
      .sort((a, b) => b.captions - a.captions);

    res.json({
      success: true,
      data: {
        totalCaptions,
        corrected,
        bySource,
        speakers: speakerList,
        activeMinutes: first && last ? Math.round(((new Date(last) - new Date(first)) / 60000) * 10) / 10 : 0,
        attendance: members.map((m) => ({
          userId: m.userId, username: m.username,
          role: m.userId === classroom.hostId ? 'HOST' : m.role,
          joins: m.joins, reconnects: m.reconnects, minutes: Math.round(m.totalSeconds / 6) / 10,
          firstJoinedAt: m.firstJoinedAt, lastSeenAt: m.lastSeenAt, lastLeftAt: m.lastLeftAt,
          present: Boolean(classroom.active && (!m.lastLeftAt || new Date(m.lastLeftAt) < new Date(m.lastSeenAt))),
        })),
      },
    });
  } catch (err) { next(err); }
};

// PUT /classrooms/:code/members/:userId/role  { role: 'CAPTIONER' | 'STUDENT' }   (host)
const setMemberRole = async (req, res, next) => {
  try {
    const classroom = await findByCode(req.params.code, req.user);
    if ((await roleOf(classroom, req.user)) !== 'HOST') throw new AppError('Only the host can change roles', 403);
    const role = req.body.role;
    if (!['CAPTIONER', 'STUDENT'].includes(role)) throw new AppError('Invalid role', 400);
    if (req.params.userId === classroom.hostId) throw new AppError('The host already has full control', 400);

    const member = await prisma.classroomMember.findUnique({
      where: { classroomId_userId: { classroomId: classroom.id, userId: req.params.userId } },
    });
    if (!member) throw new AppError('That person has not joined this class', 404);
    const updated = await prisma.classroomMember.update({ where: { id: member.id }, data: { role } });
    audit.record({ actor: req.user, action: 'class.member_role', targetType: 'user', targetId: updated.userId, meta: { code: classroom.code, role }, ip: req.ip });
    req.app.get('io')?.to(`class:${classroom.id}`).emit('class:role', { userId: updated.userId, role: updated.role });
    res.json({ success: true, data: { userId: updated.userId, role: updated.role } });
  } catch (err) { next(err); }
};

// ── Dashboards ───────────────────────────────────────────────────────────────
const minutesBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));

// GET /classrooms/stats   (teacher / admin) real numbers for the classes this person hosts
const teacherStats = async (req, res, next) => {
  try {
    if (!can(req.user, 'analytics.class')) throw new AppError('Only teachers can see class analytics', 403);
    const rooms = await prisma.classroom.findMany({
      where: { hostId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 500,
      select: { id: true, code: true, title: true, active: true, createdAt: true, endedAt: true, keywords: true, summaryAt: true, hostId: true, _count: { select: { captions: true } } },
    });
    const ids = rooms.map((r) => r.id);
    const [sources, members] = ids.length ? await Promise.all([
      prisma.caption.groupBy({ by: ['source'], where: { classroomId: { in: ids } }, _count: { _all: true } }),
      prisma.classroomMember.findMany({ where: { classroomId: { in: ids } }, select: { classroomId: true, userId: true, totalSeconds: true } }),
    ]) : [[], []];

    const hostId = req.user.id;
    const attendees = new Map(); // classroomId -> { count, seconds }
    members.filter((m) => m.userId !== hostId).forEach((m) => {
      const a = attendees.get(m.classroomId) || { count: 0, seconds: 0 };
      a.count += 1; a.seconds += m.totalSeconds; attendees.set(m.classroomId, a);
    });
    const bySource = { SPEECH: 0, SIGN: 0, TEXT: 0 };
    sources.forEach((g) => { bySource[g.source] = g._count._all; });

    const topics = {};
    rooms.forEach((r) => (r.keywords || []).forEach((k) => { const key = k.toLowerCase(); topics[key] = (topics[key] || 0) + 1; }));
    const ended = rooms.filter((r) => !r.active && r.endedAt);
    const totalAttendance = [...attendees.values()].reduce((n, a) => n + a.count, 0);

    res.json({
      success: true,
      data: {
        totals: {
          classrooms: rooms.length,
          active: rooms.filter((r) => r.active).length,
          completed: ended.length,
          captions: rooms.reduce((n, r) => n + r._count.captions, 0),
          attendance: totalAttendance,
          lectureMinutes: ended.reduce((n, r) => n + minutesBetween(r.createdAt, r.endedAt), 0),
          summaries: rooms.filter((r) => r.summaryAt).length,
        },
        bySource,
        topics: Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([topic, classes]) => ({ topic, classes })),
        recent: rooms.slice(0, 10).map((r) => ({
          code: r.code, title: r.title, active: r.active, createdAt: r.createdAt, endedAt: r.endedAt,
          captions: r._count.captions, attendees: (attendees.get(r.id) || { count: 0 }).count,
          minutes: r.endedAt ? minutesBetween(r.createdAt, r.endedAt) : null, hasNotes: Boolean(r.summaryAt),
        })),
      },
    });
  } catch (err) { next(err); }
};

// GET /classrooms/attended?page=   classes this person has joined (a student's lecture library)
const attended = async (req, res, next) => {
  try {
    const limit = 20;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const where = { userId: req.user.id, classroom: { hostId: { not: req.user.id } } };
    const [rows, total] = await Promise.all([
      prisma.classroomMember.findMany({
        where, orderBy: { lastSeenAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        include: { classroom: { select: { code: true, title: true, active: true, createdAt: true, endedAt: true, summary: true, summaryAt: true, host: { select: { username: true } }, _count: { select: { captions: true } } } } },
      }),
      prisma.classroomMember.count({ where }),
    ]);
    res.json({
      success: true,
      data: {
        classes: rows.map((m) => ({
          code: m.classroom.code, title: m.classroom.title, active: m.classroom.active, teacher: m.classroom.host.username,
          date: m.classroom.createdAt, endedAt: m.classroom.endedAt, captions: m.classroom._count.captions,
          minutesAttended: Math.round(m.totalSeconds / 60), hasNotes: Boolean(m.classroom.summaryAt),
          noteCount: m.classroom.summary && m.classroom.summary.notes ? m.classroom.summary.notes.length : 0,
          quizCount: m.classroom.summary && m.classroom.summary.quiz ? m.classroom.summary.quiz.length : 0,
        })),
        pagination: { page, pages: Math.max(1, Math.ceil(total / limit)), total },
      },
    });
  } catch (err) { next(err); }
};

module.exports = {
  createClassroom, listMine, getClassroom, updateClassroom, getCaptions, postCaption, getTranscript, exportTranscript, editCaption,
  endClassroom, reopenClassroom, translate, generateSummary, getSummary, askAboutLecture, getInsights, setMemberRole,
  teacherStats, attended, publicClassroom, roleOf, canModerate, requireAccess,
};
