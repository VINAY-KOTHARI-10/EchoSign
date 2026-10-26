// One Prisma client for the whole server (INT257: Database connectivity).
// In development, Next.js reloads modules often; keeping the client on `globalThis` avoids opening a new connection each time.
import 'server-only';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.__prisma ?? new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.__prisma = prisma;
