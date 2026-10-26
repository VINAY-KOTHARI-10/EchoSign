// Study notes: the data layer (INT257: ORM basics, CRUD operations).
// Every function takes the signed-in user's id and only ever touches that user's notes (an admin may list everyone's).
import 'server-only';
import { prisma } from '@/lib/prisma';

const PAGE_SIZE = 10;

export async function listNotes({ userId, all = false, q = '', tag = '', page = 1 }) {
  const where = {
    ...(all ? {} : { userId }),
    ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { body: { contains: q, mode: 'insensitive' } }] } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.studyNote.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      skip: (Math.max(1, page) - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.studyNote.count({ where }),
  ]);
  return { items, total, page: Math.max(1, page), pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export const getNote = (userId, id, { all = false } = {}) =>
  prisma.studyNote.findFirst({ where: { id, ...(all ? {} : { userId }) } });

export const createNote = (userId, data) => prisma.studyNote.create({ data: { ...data, userId } });

// updateMany with the owner in the filter: someone else's note simply matches nothing (count 0).
export async function updateNote(userId, id, data) {
  const result = await prisma.studyNote.updateMany({ where: { id, userId }, data });
  return result.count === 1 ? prisma.studyNote.findFirst({ where: { id, userId } }) : null;
}

export async function deleteNote(userId, id) {
  const result = await prisma.studyNote.deleteMany({ where: { id, userId } });
  return result.count === 1;
}

export const countNotes = (userId) => prisma.studyNote.count({ where: { userId } });

export const recentNotes = (userId, take = 5) =>
  prisma.studyNote.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take });
