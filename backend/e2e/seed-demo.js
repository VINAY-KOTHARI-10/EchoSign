// Seeds a demo world into the THROWAWAY data created by `npm run e2e -- --serve`: an admin, a teacher, two students,
// one live class with captions from all three sources, and one finished class with saved notes.
// Prints login helpers for each person. Never run this against real data.
'use strict';
const { withRetry } = require('./retry');
const prisma = withRetry(require('../src/config/postgres').prisma);
const { connectMongoDB } = require('../src/config/mongodb');
const jwtHelper = require('../src/utils/jwtHelper');
const mongoose = require('mongoose');

const stamp = Date.now();
const mk = async (name, role) => {
  const user = await prisma.user.create({ data: { email: `${name}-${stamp}@demo.test`, username: name, passwordHash: 'x', role, emailVerified: true, profile: { create: {} } } });
  const { refreshToken } = await jwtHelper.generateTokenPair(user, {});
  return { ...user, refreshToken };
};

(async () => {
  await connectMongoDB();
  const admin = await mk('DemoAdmin', 'ADMIN');
  const teacher = await mk('DemoTeacher', 'TEACHER');
  const asha = await mk('Asha', 'USER');
  const ben = await mk('Ben', 'USER');

  const t0 = Date.now() - 25 * 60 * 1000;
  const lines = [
    [teacher, 'SPEECH', 'Welcome everyone. Today we are looking at forces and motion.'],
    [teacher, 'SPEECH', 'A force is a push or a pull that can change how an object moves.'],
    [asha, 'TEXT', 'Is gravity a force too?'],
    [teacher, 'SPEECH', 'Yes. Gravity pulls objects toward each other, and on Earth it pulls everything down.'],
    [ben, 'SIGN', 'Hello'],
    [teacher, 'SPEECH', 'Newton’s second law says force equals mass times acceleration.'],
    [teacher, 'SPEECH', 'So a heavier cart needs a bigger push to speed up at the same rate.'],
    [asha, 'TEXT', 'Can you give an example?'],
    [teacher, 'SPEECH', 'Pushing an empty shopping trolley is easy. Pushing a full one needs much more force.'],
    [ben, 'SIGN', 'Thank you'],
    [teacher, 'SPEECH', 'Friction is a force that opposes motion between two surfaces.'],
    [teacher, 'SPEECH', 'That is why a ball rolling on grass slows down faster than on ice.'],
  ];
  const live = await prisma.classroom.create({ data: { code: 'DEMO42', title: 'Physics: forces and motion', hostId: teacher.id, keywords: ['force', 'acceleration', 'friction'] } });
  for (const [i, [who, source, text]] of lines.entries()) {
    await prisma.caption.create({ data: { classroomId: live.id, speakerId: who.id, speakerName: who.username, source, text, createdAt: new Date(t0 + i * 60000) } });
  }
  await prisma.classroomMember.createMany({ data: [
    { classroomId: live.id, userId: asha.id, username: 'Asha', joins: 2, reconnects: 1, totalSeconds: 1380 },
    { classroomId: live.id, userId: ben.id, username: 'Ben', joins: 1, totalSeconds: 1500 },
  ] });

  const done = await prisma.classroom.create({
    data: {
      code: 'DONE77', title: 'Biology: cells', hostId: teacher.id, active: false, endedAt: new Date(Date.now() - 86400000), keywords: ['cell', 'membrane'],
      summaryAt: new Date(), summary: {
        provider: 'groq', model: 'demo', captionCount: 6, chunks: 1, generatedAt: new Date().toISOString(), generatedBy: 'DemoTeacher',
        notes: ['Cells are the basic units of life.', 'The cell membrane controls what enters and leaves the cell.', 'The nucleus holds the cell’s DNA.'],
        keyTerms: [{ term: 'Cell membrane', definition: 'A thin layer around the cell that controls what passes through.' }, { term: 'Nucleus', definition: 'The part of the cell that contains DNA.' }],
        takeaways: ['All living things are made of cells.'], revision: ['Name two parts of a cell and what they do.'],
        quiz: [{ question: 'What holds a cell’s DNA?', options: ['Membrane', 'Nucleus', 'Wall', 'Fluid'], answerIndex: 1, explanation: 'The nucleus contains the DNA.' }],
      },
    },
  });
  for (let i = 0; i < 6; i += 1) await prisma.caption.create({ data: { classroomId: done.id, speakerId: teacher.id, speakerName: 'DemoTeacher', source: 'SPEECH', text: `Cells are the basic unit of life, part ${i + 1}.`, createdAt: new Date(Date.now() - 90000000 + i * 60000) } });
  await prisma.classroomMember.create({ data: { classroomId: done.id, userId: asha.id, username: 'Asha', joins: 1, totalSeconds: 2400, lastLeftAt: new Date() } });
  await prisma.auditLog.create({ data: { actorId: admin.id, actorName: admin.username, action: 'user.role_change', targetType: 'user', targetId: teacher.id, meta: { email: teacher.email, from: 'USER', to: 'TEACHER' } } });

  const people = { admin, teacher, asha, ben };
  console.log('\n=== DEMO ACCOUNTS (throwaway data) ===');
  for (const [k, u] of Object.entries(people)) console.log(`DEMO ${k}: ${u.username} refreshToken=${u.refreshToken}`);
  console.log('DEMO live class code DEMO42, finished class DONE77');
  await prisma.$disconnect();
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
