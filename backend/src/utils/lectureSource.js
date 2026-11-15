// src/utils/lectureSource.js
// The database-backed transcript source used by "ask your lecture" (see lectureAi.js for the interface). Every method
// reads only what it needs, in bounded pages, so a very long lecture never has to fit in memory.
'use strict';

const { pageCaptions, firstCaption, ORDER } = require('./captionPages');

const SELECT = { speakerName: true, text: true, source: true };

function prismaSource(prisma, classroomId) {
  return {
    total: () => prisma.caption.count({ where: { classroomId } }),

    firstAt: async () => {
      const first = await firstCaption(prisma, classroomId);
      return first ? first.createdAt : null;
    },

    // Captions containing ANY keyword, filtered by the database and returned page by page.
    scan: (keywords) => pageCaptions(prisma, classroomId, {
      where: { OR: keywords.map((k) => ({ text: { contains: k, mode: 'insensitive' } })) },
      select: SELECT, pageSize: 2000,
    }),

    // The caption with `before` captions ahead of it and `after` behind it, in lecture order (two small cursor queries).
    around: async (c, before = 1, after = 1) => {
      const [prev, next] = await Promise.all([
        before > 0
          ? prisma.caption.findMany({ where: { classroomId }, orderBy: ORDER, cursor: { id: c.id }, take: -(before + 1), select: { id: true, createdAt: true, ...SELECT } })
          : [],
        prisma.caption.findMany({ where: { classroomId }, orderBy: ORDER, cursor: { id: c.id }, take: after + 1, select: { id: true, createdAt: true, ...SELECT } }),
      ]);
      const seen = new Map();
      [...prev, ...next].forEach((row) => seen.set(row.id, row));
      return [...seen.values()];
    },

    // k captions spread evenly across the lecture.
    sample: async (k) => {
      const total = await prisma.caption.count({ where: { classroomId } });
      if (!total) return [];
      const offsets = [...new Set(Array.from({ length: Math.min(k, total) }, (_, i) => Math.floor((i * total) / Math.min(k, total))))];
      const rows = await Promise.all(offsets.map((skip) => prisma.caption.findMany({
        where: { classroomId }, orderBy: ORDER, skip, take: 1, select: { id: true, createdAt: true, ...SELECT },
      })));
      return rows.flat();
    },
  };
}

module.exports = { prismaSource };
