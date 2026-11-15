// src/controllers/chatController.js
'use strict';

const { prisma } = require('../config/postgres');
const { AppError } = require('../middleware/errorMiddleware');
const { isChatRoom } = require('../config/chatRooms');

const getMessages = async (req, res, next) => {
  try {
    const { roomId = 'global' } = req.query;
    if (!isChatRoom(roomId)) throw new AppError('Unknown chat room', 404);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const [messages, total] = await Promise.all([
      prisma.chatMessage.findMany({
        where: { roomId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, username: true } },
        },
      }),
      prisma.chatMessage.count({ where: { roomId } }),
    ]);

    res.json({
      success: true,
      data: {
        messages: messages.reverse(),
        pagination: { page, limit, total },
      },
    });
  } catch (error) {
    next(error);
  }
};

const sendMessage = async (req, res, next) => {
  try {
    const { roomId = 'global' } = req.body;
    if (!isChatRoom(roomId)) throw new AppError('Unknown chat room', 404);
    const content = String(req.body.content || '').replace(/s+/g, ' ').trim().slice(0, 2000);
    if (!content) throw new AppError('Message content required', 400);
    const type = 'TEXT'; // clients cannot post SYSTEM or AUDIO messages

    const message = await prisma.chatMessage.create({
      data: { userId: req.user.id, content, roomId, type },
      include: { user: { select: { id: true, username: true } } },
    });

    // Broadcast via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`room:${roomId}`).emit('chat:message', message);
    }

    res.status(201).json({ success: true, data: { message } });
  } catch (error) {
    next(error);
  }
};

module.exports = { getMessages, sendMessage };
