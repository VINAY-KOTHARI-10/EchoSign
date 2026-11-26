// IndexedDB storage for captions that have not been confirmed by the server yet (the "outbox").
//
// Why IndexedDB and not localStorage: captions can pile up while offline, localStorage is synchronous and small, and
// IndexedDB writes are transactional. Why persist at all: a refresh, a crash or a closed tab must not lose a caption
// the person already said.
//
// Retention (also in the README): an unsent or rejected caption is kept for 48 hours and then deleted; at most 500 are
// kept per person per class (beyond that they still send, but are only held in memory); a person's entries are deleted
// when they sign out; entries are only ever read by the same person in the same class.
//
// Schema versioning: DB_VERSION is the database version (store layout, upgraded in onupgradeneeded). Every entry also
// carries `v` (SCHEMA). An entry written by a NEWER version of the app is left alone and ignored, never rewritten or
// deleted; a malformed entry is dropped.
//
// Everything here can fail (private mode, blocked upgrade, quota, a closing connection). Callers treat any rejection as
// "storage unavailable" and carry on in memory (see lib/outbox.js).

export const DB_NAME = 'echosign-outbox';
export const DB_VERSION = 1;
export const STORE = 'captions';
export const SCHEMA = 1;
export const RETENTION_MS = 48 * 60 * 60 * 1000;
export const MAX_PER_SCOPE = 500;

export class OutboxStorageError extends Error {
  constructor(reason, cause) {
    super(`Caption storage ${reason}${cause && cause.message ? `: ${cause.message}` : ''}`);
    this.name = 'OutboxStorageError';
    this.reason = reason;       // unavailable | blocked | timeout | closed | quota | failed
    this.cause = cause;
  }
}

export const scopeOf = (userId, classroomCode) => `${userId}|${String(classroomCode).toUpperCase()}`;
const isQuota = (err) => Boolean(err) && (err.name === 'QuotaExceededError' || err.code === 22);

const request = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
});

const completion = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
  tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
});

// True when an entry from the database has the shape this version of the app understands.
export const isValidEntry = (e) => Boolean(e) && typeof e === 'object'
  && typeof e.clientId === 'string' && e.clientId.length >= 8
  && typeof e.userId === 'string' && typeof e.classroomCode === 'string'
  && typeof e.text === 'string' && e.text.trim() !== ''
  && ['SPEECH', 'SIGN', 'TEXT'].includes(e.source)
  && Number.isFinite(e.createdAt) && Number.isFinite(e.tries) && Number.isFinite(e.nextAt)
  && (e.state === 'pending' || e.state === 'failed');

class OutboxStore {
  constructor(db) {
    this.db = db;
    this.closed = false;
    // Another tab upgrading the database needs this connection closed; after that we are memory-only.
    db.onversionchange = () => { this.closed = true; try { db.close(); } catch { /* ignore */ } };
    db.onclose = () => { this.closed = true; };
  }

  async run(mode, fn) {
    if (this.closed) throw new OutboxStorageError('closed');
    try {
      const tx = this.db.transaction(STORE, mode);
      const done = completion(tx);
      done.catch(() => {}); // a failing request aborts the transaction before we reach `await done`; that is handled below
      const result = await fn(tx.objectStore(STORE));
      await done;
      return result;
    } catch (err) {
      if (err instanceof OutboxStorageError) throw err;
      throw new OutboxStorageError(isQuota(err) ? 'quota' : 'failed', err);
    }
  }

  put(entry) { return this.run('readwrite', (s) => request(s.put(entry))); }

  remove(clientId) { return this.run('readwrite', (s) => request(s.delete(clientId))); }

  byScope(scope) { return this.run('readonly', (s) => request(s.index('scope').getAll(scope))); }

  // Delete every entry matching `pick(entry)`. Deletes are issued from the read's success callback so the transaction
  // stays active.
  removeWhere(pick) {
    return this.run('readwrite', (s) => new Promise((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () => {
        const rows = (req.result || []).filter(pick);
        rows.forEach((r) => s.delete(r.clientId));
        resolve(rows.length);
      };
      req.onerror = () => reject(req.error);
    }));
  }

  removeUser(userId) { return this.removeWhere((r) => r.userId === userId); }

  purgeExpired(now = Date.now()) { return this.removeWhere((r) => !Number.isFinite(r.createdAt) || now - r.createdAt > RETENTION_MS); }

  clearAll() { return this.run('readwrite', (s) => request(s.clear())); }

  close() { this.closed = true; try { this.db.close(); } catch { /* ignore */ } }
}

// Opens (creating or upgrading) the database. Rejects with OutboxStorageError when IndexedDB is unavailable, blocked,
// slow, or a newer version of the database already exists.
export function openOutboxStore({ indexedDB = typeof globalThis !== 'undefined' ? globalThis.indexedDB : undefined, timeoutMs = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!indexedDB) { reject(new OutboxStorageError('unavailable')); return; }
    let settled = false;
    const finish = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); fn(value); } };
    const timer = setTimeout(() => finish(reject, new OutboxStorageError('timeout')), timeoutMs);
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (err) { finish(reject, new OutboxStorageError('unavailable', err)); return; }
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const from = e && Number.isFinite(e.oldVersion) ? e.oldVersion : 0;
      if (from < 1) {
        const store = db.createObjectStore(STORE, { keyPath: 'clientId' });
        store.createIndex('scope', 'scope');
        store.createIndex('userId', 'userId');
      }
      // Future versions: add `if (from < 2) { ... }` here. Never remove or rewrite existing entries in an upgrade.
    };
    req.onblocked = () => finish(reject, new OutboxStorageError('blocked'));
    req.onerror = () => finish(reject, new OutboxStorageError('unavailable', req.error));
    req.onsuccess = () => {
      if (settled) { try { req.result.close(); } catch { /* ignore */ } return; }   // we already gave up on it
      finish(resolve, new OutboxStore(req.result));
    };
  });
}

// One shared connection per page. Resolves to null when storage is unavailable (the outbox then works in memory only).
let shared = null;
export function getOutboxStore(options) {
  if (!shared || options) shared = openOutboxStore(options).catch(() => null);
  return shared;
}
export const resetSharedOutboxStore = () => { shared = null; };

// Sign-out: remove this person's unsent captions from this device. Best effort; never throws.
export async function purgeUserOutbox(userId, options) {
  if (!userId) return 0;
  try {
    const store = await getOutboxStore(options);
    return store ? await store.removeUser(userId) : 0;
  } catch { return 0; }
}
