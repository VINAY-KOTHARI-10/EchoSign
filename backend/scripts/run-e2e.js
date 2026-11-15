// Runs the end-to-end suite (e2e/*.e2e.js) against a REAL server and REAL databases, in isolation:
//   * a throwaway Postgres schema (created, migrated, then dropped)
//   * a throwaway MongoDB database (created, then dropped)
//   * email and AI keys are blanked, so no real email is sent and no AI call is made
// Your real tables and collections are never read or written.
//   npm run e2e                 run the suite
//   npm run e2e -- --serve      start the app on that isolated data with demo accounts and a demo class, and keep it
//                               running for manual testing in a browser (Ctrl+C removes everything)
//   npm run e2e -- --cleanup    remove throwaway schemas/databases left behind by an interrupted run
require('dotenv').config();
const { spawn, execSync } = require('child_process');
const http = require('http');
const mongoose = require('mongoose');
const { PrismaClient } = require('@prisma/client');

const serve = process.argv.includes('--serve');
const cleanup = process.argv.includes('--cleanup');
const stamp = Date.now();
const schema = `e2e_${stamp}`;
const mongoDb = `echosign_e2e_${stamp}`;
const PORT = String(5090 + (stamp % 50));

const pg = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL);
pg.searchParams.set('schema', schema);
const mongo = new URL(process.env.MONGODB_URI);
mongo.pathname = `/${mongoDb}`;

const env = {
  ...process.env,
  NODE_ENV: 'test',
  PORT,
  DATABASE_URL: pg.toString(),
  DIRECT_URL: pg.toString(),
  MONGODB_URI: mongo.toString(),
  BREVO_API_KEY: '',
  EMAIL_FROM: '',
  GROQ_API_KEY: '',
  RATE_LIMIT_MAX: '100000',
  // Neon keeps a finished migrate connection (and its advisory lock) open for minutes. This schema is private to this
  // run, so the lock protects nothing here and would only make back-to-back runs time out.
  PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1',
  BASE_URL: `http://localhost:${PORT}`,
};

const ping = (path) => new Promise((resolve) => {
  http.get(`${env.BASE_URL}${path}`, (res) => { res.resume(); resolve(res.statusCode); }).on('error', () => resolve(0));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function removeLeftovers() {
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } });
  const found = await admin.$queryRawUnsafe("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'e2e\_%' OR schema_name LIKE 'migtest\_%' OR schema_name LIKE 'migclean\_%' OR schema_name LIKE 'migold\_%'");
  for (const { schema_name: n } of found) { await admin.$executeRawUnsafe(`DROP SCHEMA "${n}" CASCADE`); console.log(`dropped schema ${n}`); }
  await admin.$disconnect();
  await require('../src/config/mongodb').connectMongoDB(); // has the DNS fallback for mongodb+srv lookups
  const client = mongoose.connection.getClient();
  const dbs = await client.db().admin().listDatabases();
  for (const { name } of dbs.databases.filter((d) => d.name.startsWith('echosign_e2e_'))) { await client.db(name).dropDatabase(); console.log(`dropped mongo database ${name}`); }
  await mongoose.disconnect();
  console.log(`cleanup done (${found.length} schemas)`);
}

(async () => {
  if (cleanup) { await removeLeftovers(); process.exit(0); }
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } });
  let server;
  let serverLog = '';
  let code = 1;
  try {
    console.log(`[e2e] creating throwaway schema ${schema} and database ${mongoDb}`);
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });

    server = spawn(process.execPath, ['src/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    server.stdout.on('data', (d) => { log += d; serverLog += d; });
    server.stderr.on('data', (d) => { log += d; serverLog += d; });
    let ready = false;
    for (let i = 0; i < 60 && !ready; i += 1) { ready = (await ping('/health/ready')) === 200; if (!ready) await sleep(1000); }
    if (!ready) throw new Error(`server did not become ready\n${log.slice(-1500)}`);
    console.log(`[e2e] server ready on ${env.BASE_URL}`);

    if (serve) {
      const seed = spawn(process.execPath, ['e2e/seed-demo.js'], { env, stdio: 'inherit' });
      await new Promise((resolve) => seed.on('exit', resolve));
      console.log(`[e2e] demo app running at ${env.BASE_URL}  (press Ctrl+C to stop and remove the throwaway data)`);
      await new Promise((resolve) => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
      code = 0;
    } else {
      const only = process.argv.slice(2).find((a) => !a.startsWith('--'));
      const run = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=180000', only || 'e2e/echosign.e2e.js'], { env, stdio: 'inherit' });
      code = await new Promise((resolve) => run.on('exit', resolve));
    }
  } catch (err) {
    console.error(`[e2e] setup failed: ${err.message}`);
  } finally {
    if (server) server.kill();
    try { require('fs').writeFileSync(require('path').join(__dirname, '..', 'e2e', 'server.log'), serverLog); } catch { /* best effort */ }
    await sleep(500);
    try { await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); console.log('[e2e] dropped throwaway schema'); } catch (e) { console.error(`[e2e] could not drop schema: ${e.message}`); }
    await admin.$disconnect();
    process.env.MONGODB_URI = mongo.toString();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try { await require('../src/config/mongodb').connectMongoDB(); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); console.log('[e2e] dropped throwaway MongoDB database'); break; }
      catch (e) { if (attempt === 3) console.error(`[e2e] could not drop mongo db ${mongoDb}: ${e.message.slice(0, 120)} (delete it by hand in Atlas)`); else await sleep(3000); }
    }
  }
  process.exit(code || 0);
})();
