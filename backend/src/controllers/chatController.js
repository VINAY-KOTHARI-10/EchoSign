// src/controllers/chatController.js
'use strict';

const { prisma } = require('../config/postgres');
const { AppError } = require('../middleware/errorMiddleware');
const { chatRooms, isChatRoom } = require('../config/chatRooms');
const { MESSAGE_INCLUDE, shapeMessage } = require('../utils/chatShape');
const { checkAttachment, cleanFileName, asciiName } = require('../utils/chatAttachment');

const getMessages = async (req, res, next) => {
  try {
    const { roomId = 'global' } = req.query;
    if (!(await isChatRoom(roomId))) throw new AppError('Unknown chat room', 404);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const [messages, total] = await Promise.all([
      prisma.chatMessage.findMany({
        where: { roomId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: MESSAGE_INCLUDE,
      }),
      prisma.chatMessage.count({ where: { roomId } }),
    ]);

    res.json({
      success: true,
      data: {
        messages: messages.reverse().map(shapeMessage),
        pagination: { page, limit, total },
      },
    });
  } catch (error) {
    next(error);
  }
};

// The reply target must be a message in the same room, otherwise the quote could leak text from another room.
const validReplyTarget = async (replyToId, roomId) => {
  if (!replyToId) return null;
  const target = await prisma.chatMessage.findUnique({ where: { id: String(replyToId) }, select: { id: true, roomId: true } });
  return target && target.roomId === roomId ? target.id : null;
};

const sendMessage = async (req, res, next) => {
  try {
    const { roomId = 'global' } = req.body;
    if (!(await isChatRoom(roomId))) throw new AppError('Unknown chat room', 404);
    const content = String(req.body.content || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
    if (!content) throw new AppError('Message content required', 400);
    const type = 'TEXT'; // clients cannot post SYSTEM or AUDIO messages
    const replyToId = await validReplyTarget(req.body.replyToId, roomId);

    const message = await prisma.chatMessage.create({
      data: { userId: req.user.id, content, roomId, type, replyToId },
      include: MESSAGE_INCLUDE,
    });
    const shaped = shapeMessage(message);

    // Broadcast via Socket.IO
    const io = req.app.get('io');
    if (io) io.to(`room:${roomId}`).emit('chat:message', shaped);

    res.status(201).json({ success: true, data: { message: shaped } });
  } catch (error) {
    next(error);
  }
};

// The room list: General plus one room per language that is switched on. Each room carries its latest message, how many
// messages the signed-in person has not read yet, the teachers who teach that language, and whether it is one of "my"
// languages (learning or teaching). A person who has never opened a room starts with nothing unread (their read mark is
// set to now the first time they ask).
const getRooms = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const rooms = await chatRooms();
    const ids = rooms.map((r) => r.id);

    const reads = await prisma.chatRoomRead.findMany({ where: { userId } });
    const readAt = new Map(reads.map((r) => [r.roomId, r.lastReadAt]));
    const now = new Date();
    const fresh = ids.filter((id) => !readAt.has(id));
    if (fresh.length) {
      await prisma.chatRoomRead.createMany({ data: fresh.map((roomId) => ({ userId, roomId, lastReadAt: now })), skipDuplicates: true });
      fresh.forEach((id) => readAt.set(id, now));
    }

    // Three queries for every room together: unread counts, the newest message of each room, and the teachers.
    const [unreadRows, lastIds, teachers, me] = await Promise.all([
      prisma.$queryRaw`
        SELECT m."roomId" AS "roomId", COUNT(*)::int AS "unread"
        FROM chat_messages m
        LEFT JOIN chat_room_reads r ON r."roomId" = m."roomId" AND r."userId" = ${userId}
        WHERE m."roomId" = ANY(${ids}) AND m."userId" <> ${userId} AND m."deletedAt" IS NULL AND m."createdAt" > COALESCE(r."lastReadAt", NOW())
        GROUP BY m."roomId"`,
      prisma.$queryRaw`SELECT DISTINCT ON ("roomId") id FROM chat_messages WHERE "roomId" = ANY(${ids}) ORDER BY "roomId", "createdAt" DESC`,
      prisma.user.findMany({ where: { role: { in: ['TEACHER', 'ADMIN'] }, profile: { is: { NOT: { teachingLanguages: { isEmpty: true } } } } }, select: { id: true, username: true, profile: { select: { teachingLanguages: true } } }, take: 200 }),
      prisma.userProfile.findUnique({ where: { userId }, select: { targetLanguages: true, teachingLanguages: true } }),
    ]);
    const unread = new Map(unreadRows.map((r) => [r.roomId, r.unread]));
    const lastMessages = lastIds.length ? await prisma.chatMessage.findMany({ where: { id: { in: lastIds.map((x) => x.id) } }, include: MESSAGE_INCLUDE }) : [];
    const lastBy = new Map(lastMessages.map((m) => [m.roomId, shapeMessage(m)]));
    const mine = new Set([...(me?.targetLanguages || []), ...(me?.teachingLanguages || [])]);

    res.json({
      success: true,
      data: {
        rooms: rooms.map((r) => ({
          id: r.id, code: r.code, label: r.label, desc: r.desc,
          mine: r.code ? mine.has(r.code) : false,
          teachers: r.code ? teachers.filter((t) => t.profile.teachingLanguages.includes(r.code)).slice(0, 6).map((t) => ({ id: t.id, username: t.username })) : [],
          unread: unread.get(r.id) || 0,
          lastMessage: lastBy.get(r.id) || null,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

const markRead = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    if (!(await isChatRoom(roomId))) throw new AppError('Unknown chat room', 404);
    const lastReadAt = new Date();
    await prisma.chatRoomRead.upsert({
      where: { userId_roomId: { userId: req.user.id, roomId } },
      update: { lastReadAt },
      create: { userId: req.user.id, roomId, lastReadAt },
    });
    res.json({ success: true, data: { roomId, lastReadAt } });
  } catch (error) {
    next(error);
  }
};

// POST /chat/attachments?roomId=...&caption=...&replyToId=...   (the file itself is the request body)
// Headers: Content-Type = the file type, X-File-Name = its name (URL-encoded). Creates the message with its file in one step
// and sends it to the room like any other message.
const uploadMessage = async (req, res, next) => {
  try {
    const roomId = String(req.query.roomId || 'global');
    if (!(await isChatRoom(roomId))) throw new AppError('Unknown chat room', 404);
    const verdict = checkAttachment(req.body, req.headers['content-type']);
    if (!verdict.ok) throw new AppError(verdict.message, verdict.status);
    const caption = String(req.query.caption || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    const replyToId = await validReplyTarget(req.query.replyToId, roomId);
    const name = cleanFileName(req.headers['x-file-name'], verdict.type);

    const message = await prisma.chatMessage.create({
      data: { userId: req.user.id, roomId, content: caption, type: 'TEXT', replyToId, attachment: { create: { name, mime: verdict.type, size: req.body.length, data: req.body } } },
      include: MESSAGE_INCLUDE,
    });
    const shaped = shapeMessage(message);
    const io = req.app.get('io');
    if (io) io.to(`room:${roomId}`).emit('chat:message', shaped);
    res.status(201).json({ success: true, data: { message: shaped } });
  } catch (error) {
    next(error);
  }
};

// GET /chat/attachments/:id  (needs a signed-in person; a deleted message's file is gone)
const downloadAttachment = async (req, res, next) => {
  try {
    const file = await prisma.chatAttachment.findUnique({ where: { id: String(req.params.id) }, include: { message: { select: { roomId: true, deletedAt: true } } } });
    if (!file || file.message.deletedAt || !(await isChatRoom(file.message.roomId))) throw new AppError('File not found', 404);
    const image = file.mime.startsWith('image/');
    res.set({
      'Content-Type': file.mime,
      'Content-Length': String(file.data.length),
      'Content-Disposition': `${image ? 'inline' : 'attachment'}; filename="${asciiName(file.name)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    });
    res.send(file.data);
  } catch (error) {
    next(error);
  }
};

module.exports = { getMessages, sendMessage, getRooms, markRead, validReplyTarget, uploadMessage, downloadAttachment };
