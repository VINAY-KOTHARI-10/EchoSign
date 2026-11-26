// Maintenance tasks. They are safe to run repeatedly and change nothing unless you pass --apply.
//   node scripts/maintenance.js reconcile            report drift between PostgreSQL and MongoDB
//   node scripts/maintenance.js reconcile --apply    repair it
//   node scripts/maintenance.js retention            report what the retention rules would delete
//   node scripts/maintenance.js retention --apply    delete it
//
// reconcile   PostgreSQL is the source of truth. Profile statistics are recomputed from the practice_sessions rows, and
//             the MongoDB activity document (totals, recent sessions, per-language progress) is rebuilt from the same rows
//             when it is missing or stale, e.g. after a crash between the two writes or a deleted session while MongoDB
//             was down. Streak, weekly stats and badges are left alone.
// retention   Audit-log entries older than AUDIT_RETENTION_DAYS (default 365) are removed. Ended classes older than
//             CLASS_RETENTION_DAYS are removed ONLY if that variable is set (default: keep classes forever).
//             Login sessions and one-time codes expire by themselves (MongoDB TTL indexes).
require('dotenv').config();
const { prisma } = require('../src/config/postgres');
const { connectMongoDB } = require('../src/config/mongodb');
const UserActivity = require('../src/models/mongo/UserActivity');
const { profileStats } = require('../src/utils/stats');
const { rebuildActivity } = require('../src/utils/profileSync');
const mongoose = require('mongoose');

const [task, ...flags] = process.argv.slice(2);
const apply = flags.includes('--apply');
const say = (msg) => console.log(msg);

async function reconcile() {
  const users = await prisma.user.findMany({ select: { id: true, username: true, profile: true } });
  let statsFixed = 0; let activityMissing = 0; let profilesMissing = 0; let activityDrift = 0;
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
    const activity = await UserActivity.findOne({ userId: u.id }).select('totalSessions totalMinutes recentSessions');
    if (!activity) {
      activityMissing += 1; say(`  ${u.username}: no MongoDB activity document${apply ? ', creating from PostgreSQL' : ''}`);
      if (apply) await rebuildActivity(u.id, { prisma, UserActivity });
    } else if (activity.totalSessions !== want.totalSessions || activity.totalMinutes !== want.totalMinutes
      || (activity.recentSessions || []).length !== Math.min(50, want.totalSessions)) {
      activityDrift += 1;
      say(`  ${u.username}: MongoDB activity ${activity.totalSessions}/${activity.totalMinutes}min/${(activity.recentSessions || []).length} recent -> ${want.totalSessions}/${want.totalMinutes}min${apply ? ', rebuilding from PostgreSQL' : ''}`);
      if (apply) await rebuildActivity(u.id, { prisma, UserActivity });
    }
  }
  say(`${users.length} users checked: ${statsFixed} with drifting statistics, ${activityMissing} missing activity documents, ${activityDrift} with stale MongoDB activity, ${profilesMissing} missing profiles. ${apply ? 'Repaired.' : 'Nothing changed (use --apply).'}`);
}

async function retention() {
  const auditDays = Number(process.env.AUDIT_RETENTION_DAYS) || 365;
  const auditCut = new Date(Date.now() - auditDays * 86400000);
  let oldAudit;
  try { oldAudit = await prisma.auditLog.count({ where: { createdAt: { lt: auditCut } } }); }
  catch (err) { say(`Could not read the audit log (${err.code || err.message}). Apply the latest migrations first: npm run prisma:migrate`); return; }
  say(`Audit log entries older than ${auditDays} days: ${oldAudit}`);
  if (apply && oldAudit) say(`  deleted ${(await prisma.auditLog.deleteMany({ where: { createdAt: { lt: auditCut } } })).count}`);

  // Accounts that never entered the emailed code. They cannot sign in, so they hold no data; they only occupy an
  // email address and username. (Signing up again with the same email already replaces them.)
  const unverifiedDays = Number(process.env.UNVERIFIED_ACCOUNT_DAYS) || 7;
  const unverifiedWhere = { emailVerified: false, googleId: null, createdAt: { lt: new Date(Date.now() - unverifiedDays * 86400000) } };
  let stale = [];
  try { stale = await prisma.user.findMany({ where: unverifiedWhere, select: { id: true } }); }
  catch (err) { say(`Could not read unverified accounts (${err.code || err.message}).`); }
  say(`Accounts never confirmed by email, older than ${unverifiedDays} days: ${stale.length}`);
  if (apply && stale.length) {
    const ids = stale.map((u) => u.id);
    await prisma.userProfile.deleteMany({ where: { userId: { in: ids } } });
    say(`  deleted ${(await prisma.user.deleteMany({ where: { id: { in: ids } } })).count}`);
    await UserActivity.deleteMany({ userId: { $in: ids } }).catch(() => {});
  }

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
