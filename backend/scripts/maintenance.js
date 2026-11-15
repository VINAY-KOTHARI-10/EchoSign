// Maintenance tasks. They are safe to run repeatedly and change nothing unless you pass --apply.
//   node scripts/maintenance.js reconcile            report drift between PostgreSQL and MongoDB
//   node scripts/maintenance.js reconcile --apply    repair it
//   node scripts/maintenance.js retention            report what the retention rules would delete
//   node scripts/maintenance.js retention --apply    delete it
//
// reconcile   PostgreSQL is the source of truth. Profile statistics are recomputed from the practice_sessions rows, and
//             every user gets a MongoDB activity document (registration writes Postgres first, then Mongo, so a crash
//             in between can leave a user without one).
// retention   Audit-log entries older than AUDIT_RETENTION_DAYS (default 365) are removed. Ended classes older than
//             CLASS_RETENTION_DAYS are removed ONLY if that variable is set (default: keep classes forever).
//             Login sessions and one-time codes expire by themselves (MongoDB TTL indexes).
require('dotenv').config();
const { prisma } = require('../src/config/postgres');
const { connectMongoDB } = require('../src/config/mongodb');
const UserActivity = require('../src/models/mongo/UserActivity');
const { profileStats } = require('../src/utils/stats');
const mongoose = require('mongoose');

const [task, ...flags] = process.argv.slice(2);
const apply = flags.includes('--apply');
const say = (msg) => console.log(msg);

async function reconcile() {
  const users = await prisma.user.findMany({ select: { id: true, username: true, profile: true } });
  let statsFixed = 0; let activityMissing = 0; let profilesMissing = 0;
  for (const u of users) {
    if (!u.profile) { profilesMissing += 1; say(`  ${u.username}: no profile row${apply ? ', creating' : ''}`); if (apply) await prisma.userProfile.create({ data: { userId: u.id } }); }
    const agg = await prisma.practiceSession.aggregate({ where: { userId: u.id }, _count: { _all: true }, _avg: { accuracy: true }, _sum: { duration: true } });
    const want = profileStats({ count: agg._count._all, avgAccuracy: agg._avg.accuracy, sumDuration: agg._sum.duration });
    const have = u.profile;
    const drift = have && (have.totalSessions !== want.totalSessions || have.totalMinutes !== want.totalMinutes || Math.abs(have.avgAccuracy - want.avgAccuracy) > 0.01);
    if (drift) {
      statsFixed += 1;
      say(`  ${u.username}: stats ${have.totalSessions}/${have.totalMinutes}min/${have.avgAccuracy}% -> ${want.totalSessions}/${want.totalMinutes}min/${want.avgAccuracy}%`);
      if (apply) await prisma.userProfile.update({ where: { userId: u.id }, data: want });
    }
    if (!(await UserActivity.exists({ userId: u.id }))) {
      activityMissing += 1; say(`  ${u.username}: no MongoDB activity document${apply ? ', creating' : ''}`);
      if (apply) await UserActivity.create({ userId: u.id });
    }
  }
  say(`${users.length} users checked: ${statsFixed} with drifting statistics, ${activityMissing} missing activity documents, ${profilesMissing} missing profiles. ${apply ? 'Repaired.' : 'Nothing changed (use --apply).'}`);
}

async function retention() {
  const auditDays = Number(process.env.AUDIT_RETENTION_DAYS) || 365;
  const auditCut = new Date(Date.now() - auditDays * 86400000);
  let oldAudit;
  try { oldAudit = await prisma.auditLog.count({ where: { createdAt: { lt: auditCut } } }); }
  catch (err) { say(`Could not read the audit log (${err.code || err.message}). Apply the latest migrations first: npm run prisma:migrate`); return; }
  say(`Audit log entries older than ${auditDays} days: ${oldAudit}`);
  if (apply && oldAudit) say(`  deleted ${(await prisma.auditLog.deleteMany({ where: { createdAt: { lt: auditCut } } })).count}`);

  const classDays = Number(process.env.CLASS_RETENTION_DAYS) || 0;
  if (!classDays) { say('CLASS_RETENTION_DAYS is not set: ended classes are kept (and so are their transcripts).'); return; }
  const classCut = new Date(Date.now() - classDays * 86400000);
  const where = { active: false, endedAt: { lt: classCut } };
  const old = await prisma.classroom.count({ where });
  say(`Ended classes older than ${classDays} days: ${old} (their captions and attendance go with them)`);
  if (apply && old) say(`  deleted ${(await prisma.classroom.deleteMany({ where })).count}`);
}

(async () => {
  if (!['reconcile', 'retention'].includes(task)) { console.error('Usage: node scripts/maintenance.js <reconcile|retention> [--apply]'); process.exit(1); }
  await connectMongoDB();
  say(`${task}${apply ? ' (APPLYING CHANGES)' : ' (dry run)'}`);
  await (task === 'reconcile' ? reconcile() : retention());
  await prisma.$disconnect();
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
