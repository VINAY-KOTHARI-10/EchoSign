// src/controllers/sessionController.js
// Practice Session Controller - CRUD with MongoDB + PostgreSQL

'use strict';

const { validationResult } = require('express-validator');
const { prisma } = require('../config/postgres');
const UserActivity = require('../models/mongo/UserActivity');
const { AppError } = require('../middleware/errorMiddleware');
const logger = require('../utils/logger');
const { profileStats } = require('../utils/stats');

/**
 * POST /api/v1/sessions
 * Create/save a completed practice session
 */
const createSession = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, details: errors.array() });
    }

    const {
      language, duration, accuracy, wordsAttempted,
      wordsCorrect, transcript, feedback,
    } = req.body;
    const userId = req.user.id;

    // PostgreSQL is the source of truth: the session and the profile statistics are written together, and the
    // statistics are recomputed from every session (not incremented), so a retry can never double count.
    const session = await prisma.$transaction(async (tx) => {
      const created = await tx.practiceSession.create({
        data: { userId, language, duration, accuracy, wordsAttempted, wordsCorrect, transcript, feedback },
      });
      const agg = await tx.practiceSession.aggregate({
        where: { userId }, _count: { _all: true }, _avg: { accuracy: true }, _sum: { duration: true },
      });
      await tx.userProfile.update({
        where: { userId },
        data: { ...profileStats({ count: agg._count._all, avgAccuracy: agg._avg.accuracy, sumDuration: agg._sum.duration }), lastActiveAt: new Date() },
      });
      return created;
    });

    // MongoDB activity feed is best effort. If it fails the session is still saved and scripts/maintenance.js repairs it.
    try {
      const activity = await UserActivity.findOne({ userId });
      if (activity) {
        activity.addSession({
          sessionId: session.id, language, accuracy, duration, wordsAttempted, wordsCorrect,
          avgAccuracy: accuracy, accuracyHistory: [accuracy],
        });
        await activity.save();
      }
    } catch (err) {
      logger.warn(`Activity feed update failed for session ${session.id} (run maintenance reconcile): ${err.message}`);
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${userId}`).emit('session:completed', {
        sessionId: session.id,
        accuracy,
        duration,
      });
    }

    res.status(201).json({ success: true, data: { session } });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/sessions
 * Get sessions with pagination
 */
const getSessions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const language = req.query.language;

    const search = String(req.query.search || '').trim().slice(0, 100);
    const where = {
      userId,
      ...(language ? { language } : {}),
      ...(search ? { OR: [
        { transcript: { contains: search, mode: 'insensitive' } },
        { feedback: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    };

    const [sessions, total] = await Promise.all([
      prisma.practiceSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.practiceSession.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        sessions,
        pagination: {
          page, limit, total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/sessions/:id
 */
const getSession = async (req, res, next) => {
  try {
    const session = await prisma.practiceSession.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!session) throw new AppError('Session not found', 404);
    res.json({ success: true, data: { session } });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/sessions/:id
 */
const deleteSession = async (req, res, next) => {
  try {
    const session = await prisma.practiceSession.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!session) throw new AppError('Session not found', 404);

    await prisma.practiceSession.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Session deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = { createSession, getSessions, getSession, deleteSession };
