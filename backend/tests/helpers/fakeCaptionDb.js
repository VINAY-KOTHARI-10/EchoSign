// A small in-memory stand-in for the Prisma caption queries used by the transcript code, with real cursor semantics
// (position in (createdAt, id) order, negative take = rows before the cursor). It also records the largest page it
// returned, so tests can prove memory use is bounded by the page size and not by the length of the lecture.
'use strict';

const BASE = Date.UTC(2026, 10, 14, 9, 0, 0);
const idOf = (i) => `cap-${String(i).padStart(7, '0')}`;

// n captions, oldest first. `sameTimestampRun` captions in a row share one timestamp (to exercise the id tie-break).
// `plant` = { index: 'text' } overrides the text at that index (for retrieval tests).
function makeCaptions(n, { sameTimestampRun = 7, plant = {}, classroomId = 'room-1' } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: idOf(i),
    classroomId,
    createdAt: new Date(BASE + Math.floor(i / sameTimestampRun) * 1000),
    speakerId: i % 3 === 0 ? 'u-teacher' : 'u-student',
    speakerName: i % 3 === 0 ? 'Teacher' : 'Asha',
    source: i % 3 === 0 ? 'SPEECH' : 'TEXT',
    text: plant[i] || `Sentence number ${i} about forces and motion in the physics lecture today.`,
    editedAt: null,
  }));
}

const matches = (row, where = {}) => {
  if (where.classroomId !== undefined && row.classroomId !== where.classroomId) return false;
  if (where.OR && !where.OR.some((w) => matches(row, w))) return false;
  if (where.text && where.text.contains !== undefined && !row.text.toLowerCase().includes(String(where.text.contains).toLowerCase())) return false;
  if (where.source && row.source !== where.source) return false;
  return true;
};

function fakeCaptionDb(rows) {
  const stats = { queries: 0, maxReturned: 0, calls: [] };
  const caption = {
    async findMany({ where, take, skip = 0, cursor, select } = {}) {
      stats.queries += 1;
      const list = rows.filter((r) => matches(r, where));
      let start = 0;
      if (cursor) { start = list.findIndex((r) => r.id === cursor.id); if (start < 0) return []; }
      let out;
      if (take !== undefined && take < 0) out = list.slice(Math.max(0, start + 1 - Math.abs(take)), start + 1);
      else out = list.slice(start + skip, take === undefined ? undefined : start + skip + take);
      stats.maxReturned = Math.max(stats.maxReturned, out.length);
      stats.calls.push({ take, hasCursor: Boolean(cursor) });
      return out.map((r) => (select ? Object.fromEntries(['id', 'createdAt', ...Object.keys(select)].map((k) => [k, r[k]])) : { ...r }));
    },
    async findFirst({ where, select } = {}) {
      const r = rows.find((x) => matches(x, where));
      return r ? (select ? Object.fromEntries(['id', 'createdAt', ...Object.keys(select)].map((k) => [k, r[k]])) : { ...r }) : null;
    },
    async count({ where } = {}) { return rows.filter((r) => matches(r, where)).length; },
  };
  return { prisma: { caption }, stats };
}

module.exports = { makeCaptions, fakeCaptionDb, idOf, BASE };
