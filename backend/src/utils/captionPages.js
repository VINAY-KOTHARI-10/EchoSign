// src/utils/captionPages.js
// Reads a class's captions in bounded pages, oldest first, in a stable order: (createdAt, id). Several captions can share
// one timestamp, so the id is the tie-breaker; a page boundary can therefore never skip or repeat a caption. Memory use is
// one page, whatever the length of the lecture, and there is no cap on how many captions are read in total.
'use strict';

const PAGE_SIZE = 1000;
const ORDER = [{ createdAt: 'asc' }, { id: 'asc' }];

// Async generator of arrays (pages). `where` is extra filtering on top of { classroomId }.
async function* pageCaptions(prisma, classroomId, { select, where = {}, pageSize = PAGE_SIZE } = {}) {
  let cursor = null;
  for (;;) {
    const page = await prisma.caption.findMany({
      where: { classroomId, ...where },
      orderBy: ORDER,
      take: pageSize,
      select: select ? { id: true, createdAt: true, ...select } : undefined,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!page.length) return;
    yield page;
    if (page.length < pageSize) return;
    cursor = page[page.length - 1].id;
  }
}

// Flattens pages into single captions (still one page in memory at a time).
async function* eachCaption(prisma, classroomId, options) {
  for await (const page of pageCaptions(prisma, classroomId, options)) yield* page;
}

const firstCaption = (prisma, classroomId, select) => prisma.caption.findFirst({
  where: { classroomId }, orderBy: ORDER, select: select ? { id: true, createdAt: true, ...select } : undefined,
});

module.exports = { pageCaptions, eachCaption, firstCaption, PAGE_SIZE, ORDER };
