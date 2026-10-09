// src/sockets/socketManager.js
// Socket.IO Real-Time Communication Manager
// Handles: chat, pronunciation feedback, live session updates

'use strict';
const { originCallback } = require('../config/cors');

const { Server } = require('socket.io');
const { verifyAccessToken } = require('../utils/jwtHelper');
const { prisma } = require('../config/postgres');
const logger = require('../utils/logger');

// In-memory store of connected users (use Redis in production)
const connectedUsers = new Map(); // userId -> Set of socketIds

/**
 * Initialize Socket.IO server with JWT authentication
 * @param {http.Server} httpServer
 * @returns {Server} io
 */
// Raised hands per classroom id: [{ userId, username, at }] in the order they were raised.
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

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: originCallback,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ─── Socket.IO JWT Middleware ───────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = await verifyAccessToken(token);
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, username: true, role: true },
      });

      if (!user) return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch (err) {
      logger.warn(`Socket auth failed: ${err.message}`);
      next(new Error('Authentication failed'));
    }
  });

  // ─── Connection Handler ─────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const { user } = socket;
    logger.info(`Socket connected: ${user.username} (${socket.id})`);

    // Track connected user
    if (!connectedUsers.has(user.id)) {
      connectedUsers.set(user.id, new Set());
    }
    connectedUsers.get(user.id).add(socket.id);

    // Join personal room for targeted messages
    socket.join(`user:${user.id}`);

    // Broadcast updated online count
    io.emit('users:online', connectedUsers.size);

    // ── Chat Events ──────────────────────────────────────────────────────────

    // Join a chat room
    socket.on('chat:join', (roomId) => {
      socket.join(`room:${roomId}`);
      socket.to(`room:${roomId}`).emit('chat:userJoined', {
        userId: user.id,
        username: user.username,
        timestamp: new Date(),
      });
      logger.info(`${user.username} joined room: ${roomId}`);
    });

    // Leave a chat room
    socket.on('chat:leave', (roomId) => {
      socket.leave(`room:${roomId}`);
      socket.to(`room:${roomId}`).emit('chat:userLeft', {
        userId: user.id,
        username: user.username,
        timestamp: new Date(),
      });
    });

    // Send chat message (real-time, saved via REST API separately)
    socket.on('chat:message', async (data) => {
      try {
        const { content, roomId = 'global' } = data;
        if (!content?.trim()) return;

        // Save message to PostgreSQL
        const message = await prisma.chatMessage.create({
          data: {
            userId: user.id,
            content: content.trim().substring(0, 2000),
            roomId,
            type: 'TEXT',
          },
          include: { user: { select: { id: true, username: true } } },
        });

        // Broadcast to room
        io.to(`room:${roomId}`).emit('chat:message', {
          id: message.id,
          content: message.content,
          roomId: message.roomId,
          user: message.user,
          createdAt: message.createdAt,
        });

      } catch (err) {
        logger.error('Socket chat:message error:', err);
        socket.emit('chat:error', { message: 'Failed to send message' });
      }
    });

    // Typing indicator
    socket.on('chat:typing', ({ roomId, isTyping }) => {
      socket.to(`room:${roomId}`).emit('chat:typing', {
        userId: user.id,
        username: user.username,
        isTyping,
      });
    });


    // ── Classroom Caption Events ─────────────────────────────────────────────
    // Rooms are named `class:<classroomId>`. Final captions are persisted;
    // interim captions are broadcast only (they change many times a second).
    const CAPTION_SOURCES = ['SPEECH', 'SIGN', 'TEXT'];
    const joinedClasses = new Map(); // code -> { classroom, joinedAt }
    let captionBudget = 20;          // simple per-socket rate limit
    const refill = setInterval(() => { captionBudget = 20; }, 10000);

    const presence = async (classroomId) => {
      const sockets = await io.in(`class:${classroomId}`).fetchSockets();
      return new Set(sockets.map((x) => x.user?.id)).size;
    };
    // Everyone currently in the room, with their role in this class, for the participants list.
    const participantsOf = async (classroom) => {
      const sockets = await io.in(`class:${classroom.id}`).fetchSockets();
      const seen = new Map();
      sockets.forEach((x) => { if (x.user && !seen.has(x.user.id)) seen.set(x.user.id, { userId: x.user.id, username: x.user.username }); });
      const ids = [...seen.keys()];
      const members = ids.length
        ? await prisma.classroomMember.findMany({ where: { classroomId: classroom.id, userId: { in: ids } }, select: { userId: true, role: true } })
        : [];
      const roles = new Map(members.map((m) => [m.userId, m.role]));
      return ids.map((id) => ({
        ...seen.get(id),
        role: id === classroom.hostId ? 'HOST' : roles.get(id) === 'CAPTIONER' ? 'CAPTIONER' : 'STUDENT',
      }));
    };
    const broadcastParticipants = async (classroom) => {
      io.to(`class:${classroom.id}`).emit('class:participants', await participantsOf(classroom));
    };
    const broadcastHands = (classroomId) => io.to(`class:${classroomId}`).emit('class:hands', handsOf(classroomId));

    // Can this user correct captions / lower hands? Host, site admin, or a CAPTIONER.
    const isModerator = async (classroom) => {
      if (classroom.hostId === user.id || user.role === 'ADMIN') return true;
      const member = await prisma.classroomMember.findUnique({
        where: { classroomId_userId: { classroomId: classroom.id, userId: user.id } }, select: { role: true },
      });
      return member?.role === 'CAPTIONER';
    };

    socket.on('class:join', async ({ code } = {}, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const classroom = await prisma.classroom.findUnique({
          where: { code: String(code || '').toUpperCase() },
          include: { host: { select: { id: true, username: true } } },
        });
        if (!classroom) return reply({ ok: false, error: 'Classroom not found' });
        if (!classroom.active) return reply({ ok: false, error: 'This class has ended' });

        socket.join(`class:${classroom.id}`);
        if (!joinedClasses.has(classroom.code)) {
          joinedClasses.set(classroom.code, { classroom, joinedAt: Date.now() });
          // Attendance: one row per person per class, with a running total of minutes.
          await prisma.classroomMember.upsert({
            where: { classroomId_userId: { classroomId: classroom.id, userId: user.id } },
            create: { classroomId: classroom.id, userId: user.id, username: user.username, joins: 1 },
            update: { joins: { increment: 1 }, username: user.username, lastSeenAt: new Date() },
          });
        }
        const count = await presence(classroom.id);
        io.to(`class:${classroom.id}`).emit('class:presence', { code: classroom.code, count });
        broadcastParticipants(classroom).catch((err) => logger.warn(`participants broadcast failed: ${err.message}`));
        reply({
          ok: true, count, isHost: classroom.hostId === user.id,
          canModerate: await isModerator(classroom), hands: handsOf(classroom.id),
          participants: await participantsOf(classroom),
        });
      } catch (err) {
        logger.error('Socket class:join error:', err);
        reply({ ok: false, error: 'Could not join classroom' });
      }
    });

    const leaveClass = async (code) => {
      const entry = joinedClasses.get(code);
      if (!entry) return;
      joinedClasses.delete(code);
      const { classroom, joinedAt } = entry;
      socket.leave(`class:${classroom.id}`);
      if (setHand(classroom.id, user, false)) broadcastHands(classroom.id);
      prisma.classroomMember.updateMany({
        where: { classroomId: classroom.id, userId: user.id },
        data: { totalSeconds: { increment: Math.round((Date.now() - joinedAt) / 1000) }, lastSeenAt: new Date() },
      }).catch((err) => logger.warn(`Attendance update failed: ${err.message}`));
      const count = await presence(classroom.id);
      io.to(`class:${classroom.id}`).emit('class:presence', { code, count });
      broadcastParticipants(classroom).catch((err) => logger.warn(`participants broadcast failed: ${err.message}`));
    };
    socket.on('class:leave', ({ code } = {}) => leaveClass(String(code || '').toUpperCase()));

    const cleanCaption = ({ code, text, source } = {}) => {
      const entry = joinedClasses.get(String(code || '').toUpperCase());
      const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (!entry || !clean) return null;
      return { classroom: entry.classroom, text: clean, source: CAPTION_SOURCES.includes(source) ? source : 'SPEECH' };
    };

    socket.on('class:interim', (payload) => {
      const c = cleanCaption(payload);
      if (!c) return;
      socket.to(`class:${c.classroom.id}`).emit('class:interim', {
        speakerId: user.id, speakerName: user.username, text: c.text, source: c.source, at: Date.now(),
      });
    });

    socket.on('class:caption', async (payload) => {
      const c = cleanCaption(payload);
      if (!c) return;
      const receivedAt = new Date(); // stamp on arrival: DB writes can finish out of order
      if (captionBudget-- <= 0) return socket.emit('class:error', { message: 'Slow down — too many captions' });
      try {
        const caption = await prisma.caption.create({
          data: {
            classroomId: c.classroom.id, speakerId: user.id, speakerName: user.username,
            source: c.source, text: c.text, createdAt: receivedAt,
          },
        });
        io.to(`class:${c.classroom.id}`).emit('class:caption', caption);
      } catch (err) {
        logger.error('Socket class:caption error:', err);
        socket.emit('class:error', { message: 'Failed to save caption' });
      }
    });

    // ── Hand raise queue (kept in memory; it only matters while the class is live) ──
    socket.on('class:hand', ({ code, raised } = {}) => {
      const entry = joinedClasses.get(String(code || '').toUpperCase());
      if (!entry) return;
      if (setHand(entry.classroom.id, user, Boolean(raised))) broadcastHands(entry.classroom.id);
    });

    socket.on('class:hand:lower', async ({ code, userId } = {}) => {
      const entry = joinedClasses.get(String(code || '').toUpperCase());
      if (!entry || !(await isModerator(entry.classroom))) return;
      if (removeHand(entry.classroom.id, userId)) broadcastHands(entry.classroom.id);
    });

    // ── Practice Session Events ──────────────────────────────────────────────

    // Start a practice session
    socket.on('session:start', (data) => {
      socket.join(`session:${data.sessionId}`);
      socket.emit('session:started', {
        sessionId: data.sessionId,
        timestamp: new Date(),
      });
      logger.info(`${user.username} started session: ${data.sessionId}`);
    });

    // Real-time pronunciation feedback during session
    socket.on('pronunciation:feedback', (data) => {
      // Broadcast feedback to user's personal room (multi-device support)
      io.to(`user:${user.id}`).emit('pronunciation:feedback', {
        ...data,
        timestamp: new Date(),
      });
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      clearInterval(refill);
      [...joinedClasses.keys()].forEach(leaveClass);
      const userSockets = connectedUsers.get(user.id);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          connectedUsers.delete(user.id);
        }
      }

      io.emit('users:online', connectedUsers.size);
      logger.info(`Socket disconnected: ${user.username} (${reason})`);
    });

    socket.on('error', (err) => {
      logger.error(`Socket error for ${user.username}:`, err);
    });
  });

  logger.info('Socket.IO initialized');
  return io;
}

/**
 * Get online user count
 */
function getOnlineCount() {
  return connectedUsers.size;
}

/**
 * Check if user is online
 */
function isUserOnline(userId) {
  return connectedUsers.has(userId);
}

module.exports = { initSocket, getOnlineCount, isUserOnline };
