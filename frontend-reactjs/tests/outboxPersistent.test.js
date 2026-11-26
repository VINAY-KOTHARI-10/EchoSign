// The persistent caption outbox: IndexedDB storage (against an IndexedDB double), hydration, scoping, retry rules,
// transports, permanent vs temporary errors, auth waiting, offline, storage failures, retention, sign-out, service worker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Outbox, RETRY_MS } from '../src/lib/outbox.js';
import {
  openOutboxStore, getOutboxStore, purgeUserOutbox, scopeOf, DB_NAME, DB_VERSION, STORE, SCHEMA, RETENTION_MS, MAX_PER_SCOPE, OutboxStorageError,
} from '../src/lib/outboxStore.js';
import { createOutboxSender, classifyAck, classifyHttpError, WARN_AFTER_TRIES } from '../src/lib/outboxSender.js';
import { createFakeIndexedDb } from './helpers/fakeIndexedDb.js';

let idCounter = 0;
const newId = () => `cid-${String(++idCounter).padStart(8, '0')}`;
const clock = (t = 1_000_000) => { const c = { t, now: () => c.t, advance: (ms) => { c.t += ms; } }; return c; };

const fixture = async ({ user = 'u1', code = 'ABC234', idb = createFakeIndexedDb(), time = clock() } = {}) => {
  const store = await openOutboxStore({ indexedDB: idb });
  const box = new Outbox({ newId, store, userId: user, classroomCode: code, now: time.now });
  await box.ready;
  return { idb, store, box, time, reopen: async (opts = {}) => { const b = new Outbox({ newId, store, userId: opts.user || user, classroomCode: opts.code || code, now: time.now }); await b.ready; return b; } };
};

const sender = (box, over = {}) => {
  const calls = { socket: [], http: [], notes: [], delivered: [], refresh: 0 };
  const deps = {
    box,
    socketReady: () => false,
    viaSocket: async (i) => { calls.socket.push(i.clientId); return { ok: true, caption: { id: `srv-${i.clientId}` } }; },
    viaHttp: async (i) => { calls.http.push(i.clientId); return { data: { caption: { id: `srv-${i.clientId}` }, duplicate: false } }; },
    isOnline: () => true,
    hasAuth: () => true,
    refreshAuth: async () => { calls.refresh += 1; return true; },
    notify: (m, k) => calls.notes.push([m, k]),
    onDelivered: (c) => calls.delivered.push(c),
    ...over,
  };
  return { calls, ...createOutboxSender(deps) };
};

const stored = (idb) => [...(idb.existing(DB_NAME)?.stores.get(STORE)?.rows.values() || [])];

// ── storage ──────────────────────────────────────────────────────────────────
test('the database is created with a version, a keyed store and the scope / user indexes', async () => {
  const idb = createFakeIndexedDb();
  await openOutboxStore({ indexedDB: idb });
  const db = idb.existing(DB_NAME);
  assert.equal(db.version, DB_VERSION);
  const store = db.stores.get(STORE);
  assert.equal(store.keyPath, 'clientId');
  assert.deepEqual(store.indexes.map((i) => i.name).sort(), ['scope', 'userId']);
});

test('opening again reuses the database (no second upgrade)', async () => {
  const idb = createFakeIndexedDb();
  const a = await openOutboxStore({ indexedDB: idb });
  await a.put({ clientId: 'keep-this-1', scope: 's', userId: 'u' });
  await openOutboxStore({ indexedDB: idb });
  assert.equal(stored(idb).length, 1);
});

test('IndexedDB unavailable → a clear storage error, and the shared store resolves to null', async () => {
  await assert.rejects(openOutboxStore({ indexedDB: undefined }), (e) => e instanceof OutboxStorageError && e.reason === 'unavailable');
  assert.equal(await getOutboxStore({ indexedDB: undefined }), null);
});

test('a blocked upgrade, a hung open, a throwing open() and a newer database are all reported, never hang', async () => {
  const blocked = createFakeIndexedDb(); blocked.faults.blocked = true;
  await assert.rejects(openOutboxStore({ indexedDB: blocked }), (e) => e.reason === 'blocked');
  const hung = createFakeIndexedDb(); hung.faults.hang = true;
  await assert.rejects(openOutboxStore({ indexedDB: hung, timeoutMs: 30 }), (e) => e.reason === 'timeout');
  const throwing = { open: () => { throw new DOMException ? Object.assign(new Error('denied'), { name: 'SecurityError' }) : new Error('denied'); } };
  await assert.rejects(openOutboxStore({ indexedDB: throwing }), (e) => e.reason === 'unavailable');
  const newer = createFakeIndexedDb(); newer.seed(DB_NAME, DB_VERSION + 1);
  await assert.rejects(openOutboxStore({ indexedDB: newer }), (e) => e.reason === 'unavailable');
  assert.equal(await getOutboxStore({ indexedDB: newer }), null);
});

test('another tab upgrading the database closes our connection; later writes fail cleanly (memory-only)', async () => {
  const { idb, store, box } = await fixture();
  idb.versionChange();
  await assert.rejects(store.put({ clientId: 'x-xxxxxxxx' }), (e) => e.reason === 'closed');
  const id = box.add('still works', 'TEXT');
  await box.flushWrites();
  assert.equal(box.persistent, false);
  assert.equal(box.size, 1);
  assert.ok(id);
});

// ── persistence and hydration ────────────────────────────────────────────────
test('adding a caption stores everything needed to resend it', async () => {
  const { idb, box, time } = await fixture();
  const id = box.add('hello class', 'SPEECH');
  await box.flushWrites();
  const [row] = stored(idb);
  assert.deepEqual(row, {
    v: SCHEMA, clientId: id, scope: scopeOf('u1', 'ABC234'), userId: 'u1', classroomCode: 'ABC234', text: 'hello class',
    source: 'SPEECH', createdAt: time.t, tries: 0, nextAt: 0, state: 'pending', error: '',
  });
});

test('blank captions are never queued', async () => {
  const { box } = await fixture();
  assert.equal(box.add('   ', 'TEXT'), null);
  assert.equal(box.add(undefined, 'TEXT'), null);
  assert.equal(box.size, 0);
});

test('after a reload the unsent captions come back with the same clientId, in order, and send once', async () => {
  const { box, reopen } = await fixture();
  const a = box.add('first', 'SPEECH'); box.add('second', 'TEXT');
  await box.flushWrites();
  const after = await reopen();                                  // "refresh": a brand-new Outbox over the same database
  assert.equal(after.size, 2);
  assert.ok(after.items.has(a));
  const s = sender(after);
  await s.flush();
  assert.equal(s.calls.http.length, 2);
  assert.deepEqual(s.calls.http.slice(0, 1), [a]);
  assert.equal(after.size, 0);
  await after.flushWrites();
});

test('nothing is sent until the stored captions have been loaded', async () => {
  const { idb, store, box, time } = await fixture();
  const a = box.add('saved before the refresh', 'TEXT');
  await box.flushWrites();
  let release;
  const slow = { ...store, byScope: (scope) => new Promise((r) => { release = () => r(store.byScope(scope)); }), purgeExpired: () => Promise.resolve(), remove: (id) => store.remove(id) };
  const fresh = new Outbox({ newId, store: slow, userId: 'u1', classroomCode: 'ABC234', now: time.now });
  const s = sender(fresh);
  const flushing = s.flush();
  fresh.add('typed while loading', 'TEXT');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(s.calls.http.length, 0, 'still loading: nothing may be sent yet');
  release();
  await flushing;
  assert.equal(s.calls.http.length, 2);
  assert.ok(s.calls.http.includes(a), 'the caption saved before the refresh is sent exactly once');
  assert.equal(s.calls.http.filter((x) => x === a).length, 1);
  void idb;
});

test('the same clientId is used over the socket, over HTTP and after a reload', async () => {
  const { box, reopen } = await fixture();
  const id = box.add('say it once', 'SPEECH');
  await box.flushWrites();
  const seen = [];
  // 1) socket: no reply (lost ack)
  let s = sender(box, { socketReady: () => true, viaSocket: async (i) => { seen.push(['socket', i.clientId]); return null; } });
  await s.flush();
  assert.equal(box.items.get(id).tries, 1);
  // 2) HTTP once the socket is down: the server says it already stored the caption (the first send did arrive)
  box.items.get(id).nextAt = 0;
  s = sender(box, { viaHttp: async (i) => { seen.push(['http', i.clientId]); throw Object.assign(new Error('offline blip'), {}); } });
  await s.flush();
  await box.flushWrites();
  // 3) reload, then delivered as a duplicate
  const reloaded = await reopen();
  reloaded.items.get(id).nextAt = 0;
  s = sender(reloaded, { viaHttp: async (i) => { seen.push(['http-after-reload', i.clientId]); return { data: { caption: { id: 'srv-1' }, duplicate: true } }; } });
  await s.flush();
  assert.deepEqual(seen.map((x) => x[1]), [id, id, id]);
  assert.equal(reloaded.size, 0);
});

test('captions are scoped to one person in one class: another account or class never sees or sends them', async () => {
  const { box, reopen, idb, time } = await fixture({ user: 'alice', code: 'ABC234' });
  box.add('alice, class one', 'TEXT');
  await box.flushWrites();
  const other = new Outbox({ newId, store: await openOutboxStore({ indexedDB: idb }), userId: 'alice', classroomCode: 'ZZZ999', now: time.now });
  const bob = await reopen({ user: 'bob' });
  await other.ready;
  assert.equal(bob.size, 0);
  assert.equal(other.size, 0);
  const s = sender(bob);
  await s.flush();
  assert.equal(s.calls.http.length + s.calls.socket.length, 0);
  assert.equal((await reopen()).size, 1);                         // alice still has hers
});

test('a delivered caption (or a duplicate answer) is removed from storage', async () => {
  const { box, idb } = await fixture();
  box.add('one', 'TEXT'); box.add('two', 'TEXT');
  await box.flushWrites();
  assert.equal(stored(idb).length, 2);
  const s = sender(box, { viaHttp: async (i) => ({ data: { caption: { id: 'x' }, duplicate: i.text === 'two' } }) });
  await s.flush();
  await box.flushWrites();
  assert.equal(stored(idb).length, 0);
  assert.equal(s.calls.delivered.length, 2);
  assert.equal(box.snapshot().delivered, 2);                       // the screen can say "sent"
});

test('"sent" fades after a few seconds', async () => {
  const { box, time } = await fixture();
  box.add('one', 'TEXT');
  await sender(box).flush();
  assert.equal(box.snapshot(time.t).delivered, 1);
  assert.equal(box.snapshot(time.t + 6000).delivered, 0);
});

// ── retry rules ──────────────────────────────────────────────────────────────
test('a temporary failure waits with a bounded back-off, is saved, and is retried with the same id', async () => {
  const { box, idb, time } = await fixture();
  const id = box.add('x', 'TEXT');
  const s = sender(box, { viaHttp: async () => { throw Object.assign(new Error('Bad gateway'), { status: 502 }); } });
  await s.flush();
  await box.flushWrites();
  assert.equal(box.items.get(id).tries, 1);
  assert.equal(stored(idb)[0].tries, 1);
  assert.equal(stored(idb)[0].nextAt, time.t + RETRY_MS[0]);
  assert.equal(box.due(time.t + RETRY_MS[0] - 1).length, 0);
  assert.equal(box.due(time.t + RETRY_MS[0])[0][0], id);
});

test('back-off never exceeds the last step, however many failures', async () => {
  const { box } = await fixture();
  const id = box.add('x', 'TEXT');
  for (let i = 0; i < 40; i += 1) { box.items.get(id).busy = true; box.fail(id, 0); }
  assert.equal(box.items.get(id).nextAt, RETRY_MS[RETRY_MS.length - 1]);
});

test('the person is told once, after several failed attempts, that a caption is slow', async () => {
  const { box } = await fixture();
  box.add('x', 'TEXT');
  const s = sender(box, { viaHttp: async () => { throw new Error('offline'); } });
  for (let i = 0; i < WARN_AFTER_TRIES + 2; i += 1) { box.items.forEach((it) => { it.nextAt = 0; }); await s.flush(); }
  assert.equal(s.calls.notes.filter((n) => /taking a while/.test(n[0])).length, 1);
});

test('classification: which errors are temporary, which are permanent, which are about sign-in', () => {
  assert.equal(classifyAck(null).kind, 'temporary');
  assert.equal(classifyAck({ ok: true, caption: {} }).kind, 'delivered');
  assert.equal(classifyAck({ ok: true, caption: {}, duplicate: true }).duplicate, true);
  assert.equal(classifyAck({ ok: false, code: 'NOT_JOINED' }).kind, 'temporary');
  assert.equal(classifyAck({ ok: false, code: 'RATE_LIMITED', retryable: true }).kind, 'temporary');
  assert.equal(classifyAck({ ok: false, code: 'SERVER_ERROR', retryable: true }).kind, 'temporary');
  assert.equal(classifyAck({ ok: false, code: 'UNAUTHENTICATED' }).kind, 'auth');
  assert.equal(classifyAck({ ok: false, code: 'BAD_REQUEST', error: 'Empty caption' }).kind, 'permanent');
  assert.equal(classifyHttpError(new Error('Failed to fetch')).kind, 'temporary');
  for (const status of [408, 425, 429, 500, 502, 503, 504]) assert.equal(classifyHttpError(Object.assign(new Error('x'), { status })).kind, 'temporary', String(status));
  assert.equal(classifyHttpError(Object.assign(new Error('x'), { status: 401 })).kind, 'auth');
  for (const status of [400, 403, 404, 409, 413, 422]) assert.equal(classifyHttpError(Object.assign(new Error('x'), { status })).kind, 'permanent', String(status));
});

test('a rejected caption becomes "failed": kept, shown, saved, and NOT retried on its own', async () => {
  const { box, idb } = await fixture();
  const id = box.add('class is over', 'TEXT');
  const s = sender(box, { viaHttp: async () => { throw Object.assign(new Error('This class has ended'), { status: 409 }); } });
  await s.flush();
  await box.flushWrites();
  assert.equal(box.items.get(id).state, 'failed');
  assert.equal(stored(idb)[0].state, 'failed');
  assert.match(box.snapshot().failed[0].error, /ended/);
  assert.equal(box.snapshot().pending, 0);
  assert.ok(s.calls.notes.some((n) => n[1] === 'error'));
  box.items.get(id).nextAt = 0;
  assert.equal(box.due().length, 0);
  const before = s.calls.http.length;
  await s.flush();
  assert.equal(s.calls.http.length, before, 'no automatic retry of a rejected caption');
});

test('the person can retry a rejected caption, discard one, or clear them all', async () => {
  const { box, idb, reopen } = await fixture();
  const a = box.add('a', 'TEXT'); const b = box.add('b', 'TEXT'); const c = box.add('c', 'TEXT');
  [a, b, c].forEach((id) => box.reject(id, 'nope'));
  await box.flushWrites();
  assert.equal((await reopen()).snapshot().failed.length, 3);     // failed entries survive a reload
  assert.equal(box.retry(a), true);
  assert.equal(box.retry(a), false, 'only a failed one can be retried');
  assert.equal(box.items.get(a).state, 'pending');
  assert.equal(box.items.get(a).tries, 0);
  assert.equal(box.discard(b), true);
  assert.equal(box.clearFailed(), 1);
  await box.flushWrites();
  assert.deepEqual(stored(idb).map((r) => r.clientId), [a]);
  const s = sender(box);
  await s.flush();
  assert.deepEqual(s.calls.http, [a]);
});

test('captions are sent oldest first and an item in flight is never sent twice', async () => {
  const { box, time } = await fixture();
  const ids = ['one', 'two', 'three'].map((t) => { time.advance(10); return box.add(t, 'TEXT'); });
  const s = sender(box, { viaHttp: async (i) => { await new Promise((r) => setTimeout(r, 15)); s.calls.http.push(i.clientId); return { data: { caption: { id: i.clientId } } }; } });
  s.calls.http = [];
  await Promise.all([s.flush(), s.flush(), s.flush()]);
  assert.deepEqual(s.calls.http, ids);
});

// ── auth and connectivity ────────────────────────────────────────────────────
test('with no valid sign-in nothing is sent and nothing is counted as a failure; it sends once signed in', async () => {
  const { box } = await fixture();
  const id = box.add('x', 'TEXT');
  let signedIn = false;
  const s = sender(box, { hasAuth: () => signedIn });
  await s.flush(); await s.flush();
  assert.equal(s.calls.http.length, 0);
  assert.equal(box.items.get(id).tries, 0);
  signedIn = true;
  await s.flush();
  assert.equal(s.calls.http.length, 1);
  assert.equal(box.size, 0);
});

test('an expired sign-in (401) refreshes it once for many captions and does not count as a failed attempt', async () => {
  const { box } = await fixture();
  ['a', 'b', 'c'].forEach((t) => box.add(t, 'TEXT'));
  let fresh = false;
  const s = sender(box, {
    refreshAuth: async () => { s.calls.refresh += 1; await new Promise((r) => setTimeout(r, 5)); fresh = true; return true; },
    viaHttp: async (i) => { if (!fresh) throw Object.assign(new Error('expired'), { status: 401 }); s.calls.http.push(i.clientId); return { data: { caption: { id: i.clientId } } }; },
  });
  await s.flush();
  assert.equal(s.calls.refresh, 1);
  assert.equal(box.size, 3);
  [...box.items.values()].forEach((i) => assert.equal(i.tries, 0));
  await s.flush();
  assert.equal(box.size, 0);
});

test('if the sign-in cannot be renewed the captions are kept and the person is told once', async () => {
  const { box } = await fixture();
  box.add('a', 'TEXT'); box.add('b', 'TEXT');
  const s = sender(box, { refreshAuth: async () => false, viaHttp: async () => { throw Object.assign(new Error('expired'), { status: 401 }); } });
  await s.flush(); await s.flush();
  assert.equal(box.size, 2);
  assert.equal(s.calls.notes.filter((n) => /sign-in has expired/.test(n[0])).length, 1);
  [...box.items.values()].forEach((i) => assert.equal(i.tries, 0));
});

test('offline: nothing is sent and nothing is counted; back online it sends over HTTP, or the socket when joined', async () => {
  const { box } = await fixture();
  const id = box.add('x', 'TEXT');
  let online = false; let joined = false;
  const s = sender(box, { isOnline: () => online, socketReady: () => joined });
  await s.flush();
  assert.equal(s.calls.http.length + s.calls.socket.length, 0);
  assert.equal(box.items.get(id).tries, 0);
  online = true;
  await s.flush();
  assert.deepEqual(s.calls.http, [id]);
  const id2 = box.add('y', 'TEXT');
  joined = true;
  await s.flush();
  assert.deepEqual(s.calls.socket, [id2]);
});

test('a socket ack timeout is a temporary failure (the retry is safe: same clientId, the server de-duplicates)', async () => {
  const { box } = await fixture();
  const id = box.add('x', 'TEXT');
  const s = sender(box, { socketReady: () => true, viaSocket: async () => null });
  await s.flush();
  assert.equal(box.items.get(id).tries, 1);
  assert.equal(box.items.get(id).state, 'pending');
});

// ── storage failures ─────────────────────────────────────────────────────────
test('storage unavailable at open: the outbox still sends, and says it is memory-only', async () => {
  const box = new Outbox({ newId, store: null, userId: 'u1', classroomCode: 'ABC234' });
  await box.ready;
  box.add('x', 'TEXT');
  assert.equal(box.snapshot().persistent, false);
  assert.equal(box.snapshot().storageProblem, 'unavailable');
  const s = sender(box);
  await s.flush();
  assert.equal(box.size, 0);
});

test('quota exceeded: the caption is not lost, it just stops being saved, and the problem is reported', async () => {
  const { box, idb } = await fixture();
  idb.faults.quotaAfter = 1;
  box.add('fits', 'TEXT');
  await box.flushWrites();
  box.add('does not fit', 'TEXT');
  await box.flushWrites();
  assert.equal(box.persistent, false);
  assert.equal(box.snapshot().storageProblem, 'quota');
  assert.equal(box.size, 2);
  const s = sender(box);
  await s.flush();
  await box.flushWrites();
  assert.equal(box.size, 0);
  assert.equal(s.calls.http.length, 2);
  assert.equal(stored(idb).length, 0, 'removals still work, which frees space');
});

test('a failing or aborted transaction switches to memory-only without breaking sending', async () => {
  const { box, idb } = await fixture();
  idb.faults.tx = Object.assign(new Error('aborted'), { name: 'AbortError' });
  box.add('x', 'TEXT');
  await box.flushWrites();
  assert.equal(box.persistent, false);
  assert.equal(box.snapshot().storageProblem, 'error');
  const s = sender(box);
  await s.flush();
  assert.equal(box.size, 0);
});

test('hydration failing (storage broke after opening) falls back to memory and does not throw', async () => {
  const { store } = await fixture();
  const broken = { ...store, byScope: async () => { throw new OutboxStorageError('failed'); }, purgeExpired: async () => 0, remove: async () => {} };
  const box = new Outbox({ newId, store: broken, userId: 'u1', classroomCode: 'ABC234' });
  await box.ready;
  assert.equal(box.persistent, false);
  box.add('works', 'TEXT');
  assert.equal(box.size, 1);
});

test('more than the per-class limit still sends; the extras are only held in memory and the screen can say so', async () => {
  const { box, store, time, idb } = await fixture();
  assert.equal(MAX_PER_SCOPE, 500);
  const small = new Outbox({ newId, store, userId: 'u1', classroomCode: 'LIM999', now: time.now, maxPersisted: 5 });
  await small.ready;
  for (let i = 0; i < 8; i += 1) small.add(`caption ${i}`, 'TEXT');
  await small.flushWrites();
  assert.equal(small.size, 8);
  assert.equal(small.snapshot().storageProblem, 'limit');
  assert.equal(stored(idb).filter((r) => r.classroomCode === 'LIM999').length, 5);
  const s = sender(small);
  await s.flush();
  assert.equal(small.size, 0);
  assert.equal(s.calls.http.length, 8);
  void box;
});

// ── versioning and retention ─────────────────────────────────────────────────
test('malformed entries are dropped, entries from a newer app version are left untouched, expired ones are deleted', async () => {
  const { store, idb, time } = await fixture();
  const base = { userId: 'u1', classroomCode: 'ABC234', scope: scopeOf('u1', 'ABC234'), source: 'TEXT', tries: 0, nextAt: 0, state: 'pending', createdAt: time.t };
  await store.put({ ...base, v: 1, clientId: 'good-0001', text: 'keep me' });
  await store.put({ ...base, v: 1, clientId: 'bad-00001', text: 123 });
  await store.put({ ...base, v: 1, clientId: 'bad-00002', text: 'x', source: 'FAX' });
  await store.put({ ...base, v: SCHEMA + 1, clientId: 'newer-001', text: 'from the future' });
  await store.put({ ...base, v: 1, clientId: 'old-00001', text: 'too old', createdAt: time.t - RETENTION_MS - 1 });
  const box = new Outbox({ newId, store, userId: 'u1', classroomCode: 'ABC234', now: time.now });
  await box.ready; await box.flushWrites();
  assert.deepEqual([...box.items.keys()], ['good-0001']);
  const left = stored(idb).map((r) => r.clientId).sort();
  assert.deepEqual(left, ['good-0001', 'newer-001']);
});

test('opening the outbox also deletes expired entries of other people and classes (their content is never read)', async () => {
  const { store, idb, time } = await fixture();
  await store.put({ v: 1, clientId: 'other-0001', scope: scopeOf('someone', 'QQQ111'), userId: 'someone', classroomCode: 'QQQ111', text: 'old', source: 'TEXT', createdAt: time.t - RETENTION_MS - 5, tries: 0, nextAt: 0, state: 'pending' });
  const box = new Outbox({ newId, store, userId: 'u1', classroomCode: 'ABC234', now: time.now });
  await box.ready; await box.flushWrites();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(stored(idb).length, 0);
});

// ── sign-out and account switching ───────────────────────────────────────────
test('signing out removes that person\'s unsent captions (all classes) and nobody else\'s', async () => {
  const idb = createFakeIndexedDb();
  const a1 = await fixture({ user: 'alice', code: 'AAA111', idb });
  a1.box.add('alice one', 'TEXT');
  const a2 = new Outbox({ newId, store: a1.store, userId: 'alice', classroomCode: 'BBB222', now: a1.time.now }); await a2.ready; a2.add('alice two', 'TEXT');
  const b = new Outbox({ newId, store: a1.store, userId: 'bob', classroomCode: 'AAA111', now: a1.time.now }); await b.ready; b.add('bob one', 'TEXT');
  await a1.box.flushWrites(); await a2.flushWrites(); await b.flushWrites();
  assert.equal(stored(idb).length, 3);
  assert.equal(await purgeUserOutbox('alice', { indexedDB: idb }), 2);
  assert.deepEqual(stored(idb).map((r) => r.userId), ['bob']);
  assert.equal(await purgeUserOutbox('', { indexedDB: idb }), 0);
});

test('sign-out cleanup never throws when storage is unavailable', async () => {
  assert.equal(await purgeUserOutbox('alice', { indexedDB: undefined }), 0);
});

test('a disposed outbox (the person left the class or signed out) stops reporting and does not send', async () => {
  const { box } = await fixture();
  let changes = 0;
  box.onChange = () => { changes += 1; };
  box.add('x', 'TEXT');
  const base = changes;
  box.dispose();
  box.add('y', 'TEXT');
  assert.equal(changes, base);
  const s = sender(box);
  await s.flush();
  assert.equal(s.calls.http.length, 0);
});

// ── service worker ───────────────────────────────────────────────────────────
test('the service worker never touches caption queue data and never caches non-GET requests or caption endpoints', () => {
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.ok(!/indexedDB|echosign-outbox|outbox/i.test(sw), 'the service worker must not read or cache the outbox');
  assert.match(sw, /request\.method !== 'GET'\) return/);
  assert.ok(!/captions/.test(sw.match(/const OFFLINE_API = \[[^\]]*\]/)[0]), 'caption endpoints are not cached');
  assert.ok(/socket\.io/.test(sw));
});

test('the original in-memory use of the outbox still works', () => {
  let n = 0;
  const o = new Outbox(() => `mem-${++n}-xxxxxxxx`);
  const id = o.add('hello', 'TEXT');
  assert.equal(o.due(0).length, 1);
  o.settle(id);
  assert.equal(o.size, 0);
});
