// src/Services/auditService.js
// Append-only record of sensitive actions. A failure to write the log never breaks the action itself.
'use strict';

const { prisma } = require('../config/postgres');
const logger = require('../utils/logger');

async function record({ actor, action, targetType = null, targetId = null, meta = null, ip = null }) {
  try {
    await prisma.auditLog.create({
      data: { actorId: actor?.id || null, actorName: actor?.username || null, action, targetType, targetId: targetId ? String(targetId) : null, meta, ip },
    });
  } catch (err) {
    logger.warn(`[audit] could not record ${action}: ${err.message}`);
  }
}

async function list({ page = 1, limit = 50, action } = {}) {
  const take = Math.min(100, Math.max(1, limit));
  const where = action ? { action } : {};
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip: (Math.max(1, page) - 1) * take }),
    prisma.auditLog.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / take)) };
}

module.exports = { record, list };
