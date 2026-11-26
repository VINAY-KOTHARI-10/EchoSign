// src/sockets/socketManager.js
// Socket.IO: live classroom captions, hand raising, community chat, practice-session feedback.
//
// Security model
//   * Every connection is authenticated with the user's access token (checked again on every event once it expires;
//     the client sends `auth:refresh` with a fresh token).
//   * A class code is an invitation, so joining needs a valid code for an active class and wrong guesses are rate limited.
//     After joining, every other class event is checked against that socket's membership, never against a room id the
//     client supplies.
//   * Chat rooms must be on an allow-list; practice sessions must belong to the user.
//   * Every payload is validated and sized; events are rate limited per user (so a second device cannot bypass it).
//
// Event contracts (client -> server, all with an optional ack callback):
//   class:join        { code, sinceId? }        ack { ok, count, isHost, role, canModerate, hands, participants, missed[], resync }
//   class:leave       { code }
//   class:caption     { code, text, source, clientId? }   ack { ok, caption, duplicate? }   (clientId makes retries safe)
//   class:interim     { code, text, source }     (broadcast only, throttled, never stored)
//   class:hand        { code, raised }
//   class:hand:lower  { code, userId }           (host / captioner)
//   chat:join|leave   roomId        chat:message { roomId, content }      chat:typing { roomId, isTyping }
//   session:start     { sessionId }              pronunciation:feedback { word, score, message }
//   auth:refresh      { token }
// Server -> client: class:caption, class:caption:edited, class:interim, class:presence, class:participants, class:hands,
//   class:role, class:settings, class:ended, class:error, chat:*, users:online, auth:expired.
'use strict';

const { Server } = require('socket.io');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const { originCallback } = require('../config/cors');
const { verifyAccessToken } = require('../utils/jwtHelper');
const { prisma } = require('../config/postgres');
const logger = require('../utils/logger');
const { isChatRoom } = require('../config/chatRooms');
const { PresenceRegistry } = require('./presenceRegistry');
const codeGuess = require('../utils/codeGuess');
const { canInClass, classRoleFor } = require('../config/permissions');
const { mustWait } = require('../utils/classTiming');
const { MeetRooms, attachMeet } = require('./meetManager');

const CAPTION_SOURCES = ['SPEECH', 'SIGN', 'TEXT'];
const MAX_MISSED = 500;
const TOKEN_GRACE_MS = 30 * 1000;

// ── Rate limits, per user (not per socket) ───────────────────────────────────
const limiters = {
  caption: new RateLimiterMemory({ keyPrefix: 'sock_caption', points: 30, duration: 10 }),
  chat: new RateLimiterMemory({ keyPrefix: 'sock_chat', points: 12, duration: 10 }),
  hand: new RateLimiterMemory({ keyPrefix: 'sock_hand', points: 12, duration: 10 }),
  join: new RateLimiterMemory({ keyPrefix: 'sock_join', points: 20, duration: 60 }),
};
const allow = async (name, userId) => {
  try { await limiters[name].consume(String(userId)); return true; } catch { return false; }
};

// ── Payload validation ───────────────────────────────────────────────────────
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cleanCode = (v) => { const c = String(v || '').trim().toUpperCase(); return /^[A-Z0-9]{4,10}$/.test(c) ? c : ''; };
const cleanText = (v, max = 500) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const cleanClientId = (v) => { const s = String(v || ''); return /^[A-Za-z0-9_-]{8,64}$/.test(s) ? s : null; };
const safeAck = (ack) => (typeof ack === 'function' ? ack : () => {});

// ── Raised hands per classroom id (only matters while the class is live) ─────
const handQueues = new Map();
const handsOf = (classroomId) => handQueues.get(classroomId) || [];
function removeHand(classroomId, userId) {
  const list = handsOf(classroomId);
  const next = list.filter((h) => h.userId !== userId);
  if (next.length === list.length) return false;
  if (next.length) handQueues.set(classroomId, next); else handQueues.delete(classroomId);
  return true;
}
function setHand(classroomId, user, raised) {
  const has = handsOf(classroomId).some((h) => h.userId === user.id);
  if (raised && !has) {
    handQueues.set(classroomId, [...handsOf(classroomId), { userId: user.id, username: user.username, at: Date.now() }]);
    return true;
  }
  return !raised && has ? removeHand(classroomId, user.id) : false;
}

// ── Online users across the whole app (one person with two tabs counts once) ──
const connectedUsers = new Map(); // userId -> Set(socketId)

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: originCallback, credentials: true },
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 64 * 1024, // no event legitimately needs more
  });
  const registry = new PresenceRegistry();
  const meetRooms = new MeetRooms(); // Sign Meet rooms (in memory only; nothing is stored)

  // Batch noisy broadcasts: 100 students joining at once should cause a handful of updates, not 100.
  const timers = new Map();
  const debounce = (key, ms, fn) => {
    if (timers.has(key)) return;
    timers.set(key, setTimeout(() => { timers.delete(key); fn().catch((err) => logger.warn(`broadcast ${key} failed: ${err.message}`)); }, ms));
  };
  const broadcastOnline = () => debounce('online', 1500, async () => io.emit('users:online', connectedUsers.size));

  const participantsOf = async (classroom) => {
    const present = registry.users(classroom.id);
    const ids = present.map((p) => p.userId);
    const members = ids.length
      ? await prisma.classroomMember.findMany({ where: { classroomId: classroom.id, userId: { in: ids } }, select: { userId: true, role: true } })
      : [];
    const roles = new Map(members.map((m) => [m.userId, m.role]));
    return present.map((p) => ({
      ...p,
      role: p.userId === classroom.hostId ? 'HOST' : roles.get(p.userId) === 'CAPTIONER' ? 'CAPTIONER' : 'STUDENT',
    }));
  };
  const scheduleRoomUpdate = (classroom) => debounce(`room:${classroom.id}`, 200, async () => {
    io.to(`class:${classroom.id}`).emit('class:presence', { code: classroom.code, count: registry.count(classroom.id) });
    io.to(`class:${classroom.id}`).emit('class:participants', await participantsOf(classroom));
  });
  const broadcastHands = (classroomId) => io.to(`class:${classroomId}`).emit('class:hands', handsOf(classroomId));

  // ── Attendance helpers ─────────────────────────────────────────────────────
  const addSeconds = (classroomId, userId, seconds, extra = {}) => prisma.classroomMember.updateMany({
    where: { classroomId, userId },
    data: { totalSeconds: { increment: seconds }, lastSeenAt: new Date(), ...extra },
  }).catch((err) => logger.warn(`Attendance update failed: ${err.message}`));

  // Count time every minute, so a restart or crash loses at most a minute of attendance.
  const flushTimer = setInterval(() => {
    registry.activeClassIds().forEach((classId) => {
      registry.flush(classId).forEach(({ userId, seconds }) => addSeconds(classId, userId, seconds));
    });
  }, 60 * 1000);
  flushTimer.unref();
  httpServer.on('close', () => { clearInterval(flushTimer); timers.forEach(clearTimeout); });

  // REST handlers call this when the host ends a class: count the remaining time and release everyone.
  io.finalizeClass = async (classroomId) => {
    // Wait for the writes: when the host's "end class" request returns, attendance is already final.
    await Promise.all(registry.end(classroomId).map(({ userId, seconds }) => addSeconds(classroomId, userId, seconds, { lastLeftAt: new Date() })));
    handQueues.delete(classroomId);
    const sockets = await io.in(`class:${classroomId}`).fetchSockets();
    sockets.forEach((s) => { s.leave(`class:${classroomId}`); if (s.joinedClasses) [...s.joinedClasses].forEach(([code, c]) => { if (c.id === classroomId) s.joinedClasses.delete(code); }); });
  };

  // ── Authentication ─────────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const auth = isObj(socket.handshake.auth) ? socket.handshake.auth : {};
      const token = auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      if (!token) return next(new Error('Authentication required'));
      const decoded = await verifyAccessToken(token);
      const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, username: true, role: true } });
      if (!user) return next(new Error('Authentication failed'));
      socket.user = user;
      socket.tokenExp = (decoded.exp || 0) * 1000;
      next();
    } catch (err) {
      logger.warn(`Socket auth failed: ${err.message}`);
      // A database that cannot be reached right now is not a bad token: say so, so the client simply retries.
      const transientDb = ['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(err.code) || err.name === 'PrismaClientInitializationError';
      next(new Error(transientDb ? 'Service busy, please retry' : 'Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket;
    logger.info(`Socket connected: ${user.username} (${socket.id})`);
    socket.joinedClasses = new Map(); // code -> classroom (this socket's memberships)
    let lastInterimAt = 0;

    if (!connectedUsers.has(user.id)) connectedUsers.set(user.id, new Set());
    connectedUsers.get(user.id).add(socket.id);
    socket.join(`user:${user.id}`);
    attachMeet(io, socket, meetRooms, logger);
    broadcastOnline();

    // After the access token expires, events are refused until the client sends a fresh one (auth:refresh).
    socket.use(([event], next) => {
      if (event === 'auth:refresh') return next();
      if (Date.now() > socket.tokenExp + TOKEN_GRACE_MS) {
        socket.emit('auth:expired');
        return next(new Error('token expired'));
      }
      return next();
    });
    socket.on('error', (err) => logger.warn(`Socket error for ${user.username}: ${err.message}`));

    socket.on('auth:refresh', async (payload, ack) => {
      const reply = safeAck(ack);
      try {
        const decoded = await verifyAccessToken(isObj(payload) ? payload.token : '');
        if (decoded.id !== user.id) return reply({ ok: false });
        socket.tokenExp = (decoded.exp || 0) * 1000;
        return reply({ ok: true });
      } catch { return reply({ ok: false }); }
    });

    // Host, site admin, or a CAPTIONER may correct captions and lower hands.
    const isModerator = async (classroom) => {
      if (classRoleFor(classroom, user) === 'HOST') return true;
      const member = await prisma.classroomMember.findUnique({
        where: { classroomId_userId: { classroomId: classroom.id, userId: user.id } }, select: { role: true },
      });
      return canInClass(classRoleFor(classroom, user, member?.role), 'captions.edit_any');
    };

    // ── Community chat ───────────────────────────────────────────────────────
    socket.on('chat:join', (roomId) => {
      if (!isChatRoom(roomId)) return;
      socket.join(`room:${roomId}`);
      socket.to(`room:${roomId}`).emit('chat:userJoined', { userId: user.id, username: user.username, timestamp: new Date() });
    });
    socket.on('chat:leave', (roomId) => {
      if (!isChatRoom(roomId)) return;
      socket.leave(`room:${roomId}`);
      socket.to(`room:${roomId}`).emit('chat:userLeft', { userId: user.id, username: user.username, timestamp: new Date() });
    });
    socket.on('chat:message', async (data) => {
      try {
        if (!isObj(data) || !isChatRoom(data.roomId) || !socket.rooms.has(`room:${data.roomId}`)) return;
        const content = cleanText(data.content, 2000);
        if (!content) return;
        if (!(await allow('chat', user.id))) return socket.emit('chat:error', { message: 'You are sending messages too fast' });
        const message = await prisma.chatMessage.create({
          data: { userId: user.id, content, roomId: data.roomId, type: 'TEXT' },
          include: { user: { select: { id: true, username: true } } },
        });
        io.to(`room:${data.roomId}`).emit('chat:message', {
          id: message.id, content: message.content, roomId: message.roomId, user: message.user, createdAt: message.createdAt,
        });
      } catch (err) {
        logger.error(`Socket chat:message error: ${err.message}`);
        socket.emit('chat:error', { message: 'Failed to send message' });
      }
    });
    socket.on('chat:typing', (data) => {
      if (!isObj(data) || !isChatRoom(data.roomId) || !socket.rooms.has(`room:${data.roomId}`)) return;
      socket.to(`room:${data.roomId}`).emit('chat:typing', { userId: user.id, username: user.username, isTyping: Boolean(data.isTyping) });
    });

    // ── Classroom ────────────────────────────────────────────────────────────
    const memberRole = (classroom, participants) => classRoleFor(classroom, user, (participants.find((p) => p.userId === user.id) || {}).role);

    socket.on('class:join', async (payload, ack) => {
      const reply = safeAck(ack);
      try {
        const code = isObj(payload) ? cleanCode(payload.code) : '';
        if (!code) return reply({ ok: false, error: 'Enter a valid class code', code: 'BAD_REQUEST' });
        if (!(await allow('join', user.id))) return reply({ ok: false, error: 'Too many join attempts. Wait a moment.', code: 'RATE_LIMITED' });
        const wait = await codeGuess.blockedFor(user.id);
        if (wait) return reply({ ok: false, error: `Too many wrong codes. Try again in ${Math.ceil(wait / 60)} minute(s).`, code: 'TOO_MANY_ATTEMPTS', retryAfter: wait });

        const classroom = await prisma.classroom.findUnique({ where: { code } });
        if (!classroom) { await codeGuess.recordMiss(user.id); return reply({ ok: false, error: 'Classroom not found', code: 'NOT_FOUND' }); }
        if (!classroom.active) return reply({ ok: false, error: 'This class has ended', code: 'ENDED' });
        if (mustWait(classroom, classRoleFor(classroom, user))) {
          return reply({ ok: false, error: 'This class has not started yet.', code: 'NOT_STARTED', startsAt: new Date(classroom.scheduledAt).toISOString() });
        }

        const already = socket.joinedClasses.has(code);
        socket.join(`class:${classroom.id}`);
        socket.joinedClasses.set(code, classroom);
        const { first } = registry.join(classroom.id, user, socket.id);

        if (first && !already) {
          // Attendance: one row per person per class. A person returning after leaving counts as a reconnection.
          const existing = await prisma.classroomMember.findUnique({
            where: { classroomId_userId: { classroomId: classroom.id, userId: user.id } },
            select: { lastLeftAt: true },
          });
          if (!existing) {
            await prisma.classroomMember.create({ data: { classroomId: classroom.id, userId: user.id, username: user.username, joins: 1 } });
          } else {
            await prisma.classroomMember.update({
              where: { classroomId_userId: { classroomId: classroom.id, userId: user.id } },
              data: { joins: { increment: 1 }, ...(existing.lastLeftAt ? { reconnects: { increment: 1 } } : {}), username: user.username, lastSeenAt: new Date() },
            });
          }
        }

        // Captions this client missed while it was offline (sinceId = the last caption it has).
        let missed = []; let resync = false;
        const sinceId = isObj(payload) && payload.sinceId ? String(payload.sinceId).slice(0, 64) : null;
        if (sinceId) {
          const anchor = await prisma.caption.findFirst({ where: { id: sinceId, classroomId: classroom.id }, select: { createdAt: true } });
          if (!anchor) resync = true;
          else {
            missed = await prisma.caption.findMany({
              where: { classroomId: classroom.id, OR: [{ createdAt: { gt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { gt: sinceId } }] },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: MAX_MISSED + 1,
            });
            if (missed.length > MAX_MISSED) { resync = true; missed = []; }
          }
        }

        scheduleRoomUpdate(classroom);
        const participants = await participantsOf(classroom);
        reply({
          ok: true, count: registry.count(classroom.id), isHost: classroom.hostId === user.id, role: memberRole(classroom, participants),
          canModerate: await isModerator(classroom), hands: handsOf(classroom.id), participants, missed, resync,
        });
      } catch (err) {
        logger.error(`Socket class:join error: ${err.message}`);
        reply({ ok: false, error: 'Could not join classroom', code: 'SERVER_ERROR' });
      }
    });

    const leaveClass = async (code) => {
      const classroom = socket.joinedClasses.get(code);
      if (!classroom) return;
      socket.joinedClasses.delete(code);
      socket.leave(`class:${classroom.id}`);
      const { last, seconds } = registry.leave(classroom.id, user.id, socket.id);
      if (last) {
        // The person's final device left: count the time, note the departure, drop their raised hand.
        await addSeconds(classroom.id, user.id, seconds, { lastLeftAt: new Date() });
        if (setHand(classroom.id, user, false)) broadcastHands(classroom.id);
        scheduleRoomUpdate(classroom);
      }
    };
    socket.on('class:leave', (payload) => { if (isObj(payload)) leaveClass(cleanCode(payload.code)); });

    // Returns the validated classroom this socket has joined, or null.
    const joinedRoom = (payload) => (isObj(payload) ? socket.joinedClasses.get(cleanCode(payload.code)) : null) || null;

    socket.on('class:interim', (payload) => {
      const classroom = joinedRoom(payload);
      const text = isObj(payload) ? cleanText(payload.text) : '';
      if (!classroom || !text) return;
      const now = Date.now();
      if (now - lastInterimAt < 120) return; // draft lines change many times a second; dropping some is harmless
      lastInterimAt = now;
      const source = CAPTION_SOURCES.includes(payload.source) ? payload.source : 'SPEECH';
      socket.to(`class:${classroom.id}`).emit('class:interim', { speakerId: user.id, speakerName: user.username, text, source, at: now });
    });

    socket.on('class:caption', async (payload, ack) => {
      const reply = safeAck(ack);
      const classroom = joinedRoom(payload);
      if (!classroom) return reply({ ok: false, error: 'Join the class first', code: 'NOT_JOINED' });
      const text = cleanText(payload.text);
      if (!text) return reply({ ok: false, error: 'Empty caption', code: 'BAD_REQUEST' });
      if (!(await allow('caption', user.id))) {
        socket.emit('class:error', { message: 'Slow down: too many captions' });
        return reply({ ok: false, error: 'Too many captions', code: 'RATE_LIMITED', retryable: true });
      }
      const receivedAt = new Date(); // stamp on arrival: database writes can finish out of order
      const source = CAPTION_SOURCES.includes(payload.source) ? payload.source : 'SPEECH';
      const clientId = cleanClientId(payload.clientId);
      try {
        const caption = await prisma.caption.create({
          data: { classroomId: classroom.id, speakerId: user.id, speakerName: user.username, source, text, createdAt: receivedAt, clientId },
        });
        io.to(`class:${classroom.id}`).emit('class:caption', caption);
        return reply({ ok: true, caption });
      } catch (err) {
        if (err.code === 'P2002' && clientId) {
          // The same send arrived twice (a retry after a lost ack). Return the stored caption; do not store or broadcast again.
          const existing = await prisma.caption.findFirst({ where: { classroomId: classroom.id, clientId } });
          return reply({ ok: true, caption: existing, duplicate: true });
        }
        logger.error(`Socket class:caption error: ${err.message}`);
        socket.emit('class:error', { message: 'Failed to save caption' });
        return reply({ ok: false, error: 'Failed to save caption', code: 'SERVER_ERROR', retryable: true });
      }
    });

    socket.on('class:hand', async (payload) => {
      const classroom = joinedRoom(payload);
      if (!classroom || !(await allow('hand', user.id))) return;
      if (setHand(classroom.id, user, Boolean(payload.raised))) broadcastHands(classroom.id);
    });
    socket.on('class:hand:lower', async (payload) => {
      const classroom = joinedRoom(payload);
      if (!classroom || !(await isModerator(classroom))) return;
      if (removeHand(classroom.id, String(payload.userId || ''))) broadcastHands(classroom.id);
    });

    // ── Practice sessions ────────────────────────────────────────────────────
    socket.on('session:start', async (data) => {
      try {
        const sessionId = isObj(data) ? String(data.sessionId || '').slice(0, 64) : '';
        if (!sessionId) return;
        const owned = await prisma.practiceSession.findFirst({ where: { id: sessionId, userId: user.id }, select: { id: true } });
        if (!owned) return socket.emit('session:error', { message: 'Session not found' });
        socket.join(`session:${sessionId}`);
        socket.emit('session:started', { sessionId, timestamp: new Date() });
      } catch (err) { logger.warn(`session:start failed: ${err.message}`); }
    });
    socket.on('pronunciation:feedback', (data) => {
      if (!isObj(data)) return;
      const score = Number(data.score);
      io.to(`user:${user.id}`).emit('pronunciation:feedback', {
        word: cleanText(data.word, 80), message: cleanText(data.message, 300),
        score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null, timestamp: new Date(),
      });
    });

    // ── Disconnect: release every class this socket was in, and any timers ───
    socket.on('disconnect', (reason) => {
      [...socket.joinedClasses.keys()].forEach((code) => { leaveClass(code).catch((err) => logger.warn(`leave on disconnect failed: ${err.message}`)); });
      const userSockets = connectedUsers.get(user.id);
      if (userSockets) { userSockets.delete(socket.id); if (!userSockets.size) connectedUsers.delete(user.id); }
      broadcastOnline();
      logger.info(`Socket disconnected: ${user.username} (${reason})`);
    });
  });

  logger.info('Socket.IO initialized');
  return io;
}

const getOnlineCount = () => connectedUsers.size;
const isUserOnline = (userId) => connectedUsers.has(userId);

module.exports = { initSocket, getOnlineCount, isUserOnline, handsOf };
