// Captions waiting to be confirmed by the server, kept in IndexedDB so a refresh, crash or closed tab cannot lose them.
//
// Each caption has a clientId (the idempotency key). The SAME clientId is used over the socket, over HTTP and after a
// reload, so sending it again after a lost reply can never store it twice: the server answers "duplicate" with the stored
// caption and the entry is simply removed.
//
// An entry is in one of two states:
//   pending  – will be (re)sent, with a bounded back-off between attempts
//   failed   – the server rejected it for good (class ended, not allowed, invalid); it stays visible until the person
//              retries or discards it, and is never retried automatically
// Delivered captions are removed; the last few are remembered in memory only, so the screen can say "sent".
//
// Everything is scoped to one person in one class. Storage failures (unavailable, blocked, quota, a failing transaction)
// never stop captions from sending: the outbox keeps working in memory and reports `storageProblem`, so the screen can say
// the captions would be lost if the page were closed.
//
// This class does no networking; lib/outboxSender.js does. That keeps the retry rules testable.
import { MAX_PER_SCOPE, RETENTION_MS, SCHEMA, isValidEntry, scopeOf } from './outboxStore.js';

export const RETRY_MS = [1500, 3000, 6000, 10000]; // back-off between attempts; the last value repeats
const RECENT_LIMIT = 20;
export const DELIVERED_SHOW_MS = 5000;

export class Outbox {
  // `new Outbox(newId)` (in-memory, for simple uses) or `new Outbox({ newId, store, userId, classroomCode, now, onChange })`.
  constructor(options = {}) {
    const o = typeof options === 'function' ? { newId: options } : options;
    this.newId = o.newId;
    this.store = o.store || null;
    this.userId = o.userId || '';
    this.classroomCode = o.classroomCode || '';
    this.scope = scopeOf(this.userId, this.classroomCode);
    this.now = o.now || (() => Date.now());
    this.maxPersisted = o.maxPersisted || MAX_PER_SCOPE;
    this.onChange = o.onChange || (() => {});
    this.items = new Map();       // clientId -> entry (+ busy)
    this.recent = [];             // delivered, in memory only: { clientId, at }
    this.disposed = false;
    // `holding`: a temporary in-memory box used while storage is still opening; it reports no problem and hands its
    // captions to the real box with adopt().
    this.persistent = Boolean(this.store) || Boolean(o.holding);
    this.storageProblem = this.store || o.holding ? '' : 'unavailable';
    this.persistedCount = 0;
    this.chain = Promise.resolve(); // storage writes happen one after another, in order
    this.ready = this.store ? this.hydrate() : Promise.resolve();
  }

  get size() { return this.items.size; }

  // Load what an earlier visit (or a crash) left behind for this person and class.
  async hydrate() {
    try {
      this.store.purgeExpired(this.now()).catch(() => {});
      const rows = await this.store.byScope(this.scope);
      const now = this.now();
      for (const row of rows) {
        if (row && row.v > SCHEMA) continue;                              // written by a newer app: leave it alone
        if (!isValidEntry(row)) { this.write(() => this.store.remove(row && row.clientId)); continue; }
        if (now - row.createdAt > RETENTION_MS) { this.write(() => this.store.remove(row.clientId)); continue; }
        if (this.items.has(row.clientId)) continue;                       // already known (added before loading finished)
        this.items.set(row.clientId, { ...row, busy: false });
        this.persistedCount += 1;
      }
    } catch (err) {
      this.degrade(err);
    }
    this.changed();
  }

  changed() { if (!this.disposed) this.onChange(); }

  degrade(err) {
    this.persistent = false;
    this.storageProblem = err && err.reason === 'quota' ? 'quota' : 'error';
  }

  // Queue a storage operation after the previous one. Failures switch to memory-only; they never throw to the caller.
  write(op) {
    if (!this.store) return Promise.resolve();
    this.chain = this.chain.then(op).catch((err) => { this.degrade(err); this.changed(); });
    return this.chain;
  }

  persist(item) {
    if (!this.persistent) return;
    const { busy, ...entry } = item; // eslint-disable-line no-unused-vars
    this.write(() => (this.persistent ? this.store.put(entry) : undefined));
  }

  // Resolves when every queued storage write has finished (used by tests and before the page unloads).
  flushWrites() { return this.chain; }

  add(text, source) {
    const clean = String(text ?? '');
    if (!clean.trim()) return null;
    const clientId = this.newId();
    const item = {
      v: SCHEMA, clientId, scope: this.scope, userId: this.userId, classroomCode: this.classroomCode,
      text: clean, source, createdAt: this.now(), tries: 0, nextAt: 0, state: 'pending', error: '', busy: false,
    };
    this.items.set(clientId, item);
    if (this.persistedCount >= this.maxPersisted) {
      // Too many waiting to keep them all on disk: this one still sends, but is held in memory only.
      if (!this.storageProblem) this.storageProblem = 'limit';
    } else { this.persistedCount += 1; this.persist(item); }
    this.changed();
    return clientId;
  }

  // Take over captions queued before storage finished opening (same clientIds, same order).
  adopt(entries) {
    for (const e of entries) {
      if (this.items.has(e.clientId)) continue;
      const item = { ...e, scope: this.scope, busy: false };
      this.items.set(item.clientId, item);
      if (this.persistedCount >= this.maxPersisted) { if (!this.storageProblem) this.storageProblem = 'limit'; } else { this.persistedCount += 1; this.persist(item); }
    }
    this.changed();
  }

  // Pending items ready to send now, oldest first. They are marked busy so one item is never sent twice at once.
  due(now = this.now()) {
    const out = [];
    [...this.items.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt || (a[0] < b[0] ? -1 : 1)).forEach(([clientId, item]) => {
      if (item.state !== 'pending' || item.busy || now < item.nextAt) return;
      item.busy = true;
      out.push([clientId, item]);
    });
    return out;
  }

  // The server stored it (or already had it): remove it for good.
  settle(clientId) {
    const item = this.items.get(clientId);
    if (!item) return;
    this.items.delete(clientId);
    if (this.persistedCount > 0) this.persistedCount -= 1;
    this.recent = [...this.recent, { clientId, at: this.now() }].slice(-RECENT_LIMIT);
    this.write(() => this.store.remove(clientId));
    this.changed();
  }

  // A temporary failure: wait a little longer before the next attempt. Returns the number of failed attempts.
  fail(clientId, now = this.now()) {
    const item = this.items.get(clientId);
    if (!item) return 0;
    item.busy = false;
    item.tries += 1;
    item.nextAt = now + RETRY_MS[Math.min(item.tries - 1, RETRY_MS.length - 1)];
    this.persist(item);
    this.changed();
    return item.tries;
  }

  // A permanent failure: the server will never accept this caption. Keep it visible; do not retry on its own.
  reject(clientId, reason) {
    const item = this.items.get(clientId);
    if (!item) return;
    item.busy = false;
    item.state = 'failed';
    item.error = String(reason || 'The caption was not accepted').slice(0, 300);
    this.persist(item);
    this.changed();
  }

  // The person chose to try a rejected caption again.
  retry(clientId) {
    const item = this.items.get(clientId);
    if (!item || item.state !== 'failed') return false;
    item.state = 'pending'; item.error = ''; item.tries = 0; item.nextAt = 0; item.busy = false;
    this.persist(item);
    this.changed();
    return true;
  }

  // Remove one entry (the person chose to discard it).
  discard(clientId) {
    if (!this.items.delete(clientId)) return false;
    if (this.persistedCount > 0) this.persistedCount -= 1;
    this.write(() => this.store.remove(clientId));
    this.changed();
    return true;
  }

  clearFailed() {
    let n = 0;
    [...this.items.values()].filter((i) => i.state === 'failed').forEach((i) => { this.discard(i.clientId); n += 1; });
    return n;
  }

  // Nothing was sent (for example, offline or waiting for sign-in): try again later without counting a failure.
  release(clientId) {
    const item = this.items.get(clientId);
    if (item) item.busy = false;
  }

  recentDelivered(now = this.now()) { return this.recent.filter((r) => now - r.at < DELIVERED_SHOW_MS).length; }

  // What the screen needs.
  snapshot(now = this.now()) {
    const all = [...this.items.values()].sort((a, b) => a.createdAt - b.createdAt);
    return {
      pending: all.filter((i) => i.state === 'pending').length,
      failed: all.filter((i) => i.state === 'failed').map((i) => ({ clientId: i.clientId, text: i.text, source: i.source, error: i.error, createdAt: i.createdAt })),
      delivered: this.recentDelivered(now),
      persistent: this.persistent,
      storageProblem: this.storageProblem,
    };
  }

  dispose() { this.disposed = true; }
}
