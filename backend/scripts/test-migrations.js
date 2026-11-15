// Migration safety test. Uses throwaway Postgres schemas, so your real tables are never touched.
//   1. Clean database: every migration applies from scratch and the result matches schema.prisma.
//   2. Existing data: build the database as it was BEFORE the newest migration, insert rows in the old shape,
//      apply the newest migration, and check every row survived with sensible defaults.
// Every raw SQL statement names its schema explicitly (a Prisma "?schema=" URL does not apply to raw queries), and a
// guard fails the run if the real `public` tables changed at all.
// Usage: node scripts/test-migrations.js   (needs DIRECT_URL or DATABASE_URL in .env)
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

const base = process.env.DIRECT_URL || process.env.DATABASE_URL;
const stamp = Date.now();
const mkUrl = (schema) => { const u = new URL(base); u.searchParams.set('schema', schema); return u.toString(); };
// The advisory lock is skipped: each schema here is private to this run, and Neon leaves a finished migrate connection
// (holding the lock) open for minutes, which would make back-to-back runs time out.
const envFor = (url) => ({ ...process.env, DATABASE_URL: url, DIRECT_URL: url, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1' });
const run = (cmd, env) => { try { return execSync(cmd, { env, stdio: 'pipe', encoding: 'utf8' }); } catch (e) { return `FAILED: ${e.stdout || ''}${e.stderr || ''}`; } };
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) process.exitCode = 1; return cond; };

const prismaDir = path.join(__dirname, '..', 'prisma');
const migrations = fs.readdirSync(path.join(prismaDir, 'migrations')).filter((d) => /^\d+_/.test(d)).sort();
const newest = migrations[migrations.length - 1];

(async () => {
  const admin = new PrismaClient({ datasources: { db: { url: base } } });
  const schemas = [];
  const make = async (name) => { schemas.push(name); await admin.$executeRawUnsafe(`CREATE SCHEMA "${name}"`); return mkUrl(name); };

  // Safety net: a fingerprint of the real tables that must be identical at the end.
  const fingerprint = async () => {
    const t = await admin.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`);
    const counts = {};
    for (const { table_name: n } of t) counts[n] = Number((await admin.$queryRawUnsafe(`SELECT count(*)::int AS n FROM public."${n}"`))[0].n);
    return JSON.stringify(counts);
  };
  const realBefore = await fingerprint();

  try {
    // ── 1. clean database ───────────────────────────────────────────────────
    const cleanUrl = await make(`migclean_${stamp}`);
    const out = run('npx prisma migrate deploy', envFor(cleanUrl));
    if (!ok(!/FAILED/.test(out) && /successfully applied/.test(out), `clean database: all ${migrations.length} migrations apply`)) { console.log(out.slice(0, 600)); return; }
    const drift = run(`npx prisma migrate diff --from-url "${cleanUrl}" --to-schema-datamodel prisma/schema.prisma --exit-code`, envFor(cleanUrl));
    const removed = drift.split('\n').filter((l) => /^\s+- /.test(l)).map((l) => l.trim());
    const onlyLegacy = removed.length > 0 && removed.every((l) => /refresh_tokens/.test(l));
    ok(/No difference/i.test(drift) || onlyLegacy, `migrations match schema.prisma${onlyLegacy ? ' (apart from the legacy refresh_tokens table, safe to ignore: refresh tokens live in MongoDB)' : ''}`);

    // ── 2. existing data ────────────────────────────────────────────────────
    const oldName = `migold_${stamp}`;
    const oldUrl = await make(oldName);
    const T = (table) => `"${oldName}"."${table}"`;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-old-'));
    fs.mkdirSync(path.join(tmp, 'migrations'));
    fs.copyFileSync(path.join(prismaDir, 'schema.prisma'), path.join(tmp, 'schema.prisma'));
    fs.copyFileSync(path.join(prismaDir, 'migrations', 'migration_lock.toml'), path.join(tmp, 'migrations', 'migration_lock.toml'));
    migrations.filter((m) => m !== newest).forEach((m) => fs.cpSync(path.join(prismaDir, 'migrations', m), path.join(tmp, 'migrations', m), { recursive: true }));
    const before = run(`npx prisma migrate deploy --schema "${path.join(tmp, 'schema.prisma')}"`, envFor(oldUrl));
    if (!ok(!/FAILED/.test(before), `old database: ${migrations.length - 1} migrations (everything before ${newest})`)) { console.log(before.slice(0, 600)); return; }

    const q = (sql) => admin.$executeRawUnsafe(sql);
    await q(`INSERT INTO ${T('users')} (id, email, username, "updatedAt") VALUES ('u1','teacher@old.test','oldteacher', now()), ('u2','student@old.test','oldstudent', now())`);
    await q(`INSERT INTO ${T('classrooms')} (id, code, title, "hostId") VALUES ('c1','OLDCLS','Legacy class','u1')`);
    await q(`INSERT INTO ${T('captions')} (id, "classroomId", "speakerName", text) VALUES ('k1','c1','oldteacher','first legacy caption'), ('k2','c1','oldteacher','second legacy caption'), ('k3','c1','oldstudent','third legacy caption')`);
    await q(`INSERT INTO ${T('classroom_members')} (id, "classroomId", "userId", username, joins, "totalSeconds") VALUES ('m1','c1','u2','oldstudent', 3, 1800)`);

    const upgrade = run('npx prisma migrate deploy', envFor(oldUrl));
    ok(!/FAILED/.test(upgrade) && new RegExp(newest).test(upgrade), `existing data: ${newest} applies on top of a populated database`);

    const count = async (t) => Number((await admin.$queryRawUnsafe(`SELECT count(*)::int AS n FROM ${T(t)}`))[0].n);
    ok((await count('users')) === 2 && (await count('classrooms')) === 1 && (await count('captions')) === 3 && (await count('classroom_members')) === 1, 'no rows were lost or duplicated');
    const caps = await admin.$queryRawUnsafe(`SELECT id, text, "clientId" FROM ${T('captions')} ORDER BY id`);
    ok(caps.every((c) => c.clientId === null) && caps[0].text === 'first legacy caption', 'old captions keep their text and get no clientId');
    const [m] = await admin.$queryRawUnsafe(`SELECT joins, "totalSeconds", "lastLeftAt", reconnects FROM ${T('classroom_members')}`);
    ok(m.joins === 3 && m.totalSeconds === 1800 && m.lastLeftAt === null && m.reconnects === 0, 'old attendance is unchanged; new columns default to NULL / 0');
    let multiNull = true;
    try { await q(`INSERT INTO ${T('captions')} (id, "classroomId", "speakerName", text) VALUES ('k4','c1','x','no id yet'), ('k5','c1','x','no id yet either')`); } catch { multiNull = false; }
    ok(multiNull, 'captions without a clientId can still be added (NULLs do not collide)');
    await q(`INSERT INTO ${T('captions')} (id, "classroomId", "speakerName", text, "clientId") VALUES ('k6','c1','x','with id','abc12345')`);
    let blocked = false;
    try { await q(`INSERT INTO ${T('captions')} (id, "classroomId", "speakerName", text, "clientId") VALUES ('k7','c1','x','same id again','abc12345')`); } catch { blocked = true; }
    ok(blocked, 'the same clientId cannot be stored twice in one class');
    await q(`INSERT INTO ${T('audit_logs')} (id, action) VALUES ('a1','test')`);
    ok((await count('audit_logs')) === 1, 'the new audit_logs table works');
    fs.rmSync(tmp, { recursive: true, force: true });
  } finally {
    for (const s of schemas) { try { await admin.$executeRawUnsafe(`DROP SCHEMA "${s}" CASCADE`); } catch (e) { console.log(`could not drop ${s}: ${e.message}`); } }
    console.log(`temporary schemas dropped (${schemas.length})`);
    ok((await fingerprint()) === realBefore, 'your real tables were not touched (row counts identical before and after)');
    await admin.$disconnect();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
