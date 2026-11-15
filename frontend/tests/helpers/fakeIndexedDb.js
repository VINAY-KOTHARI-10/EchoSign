// A small in-memory IndexedDB double: just the part of the API lib/outboxStore.js uses (open + upgrade, one object store
// with key path and simple indexes, transactions with complete / abort, getAll, put, delete, clear). It can be told to
// fail in the ways real browsers do: no IndexedDB, blocked upgrade, quota errors, aborted transactions, a newer database.
// It is NOT a full implementation; the real browser is covered by the manual checks in the README.

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const later = (fn) => setTimeout(fn, 0);

export function createFakeIndexedDb() {
  const dbs = new Map(); // name -> { version, stores: Map(name -> { keyPath, indexes:[], rows: Map }) }
  const faults = { open: null, blocked: false, putError: null, tx: null, hang: false, quotaAfter: Infinity, puts: 0 };
  const opened = [];

  const makeTx = (db, storeName, mode) => {
    const tx = { error: null, oncomplete: null, onerror: null, onabort: null, mode };
    const store = db.stores.get(storeName);
    let pending = 0; let failed = null; let finished = false;
    const finish = () => { if (finished) return; finished = true; later(() => { if (failed) { tx.error = failed; tx.onabort?.(); tx.onerror?.(); } else tx.oncomplete?.(); }); };
    const settleSoon = () => later(() => { if (pending === 0) finish(); });
    const req = (work) => {
      const r = { result: undefined, error: null, onsuccess: null, onerror: null };
      pending += 1;
      later(() => {
        pending -= 1;
        try { r.result = work(); r.onsuccess?.(); } catch (err) { r.error = err; failed = failed || err; r.onerror?.(); }
        settleSoon();
      });
      return r;
    };
    const indexFor = (name) => store.indexes.find((i) => i.name === name);
    tx.objectStore = () => ({
      put: (value) => req(() => {
        faults.puts += 1;
        if (faults.putError) throw faults.putError;
        if (faults.puts > faults.quotaAfter) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
        const stored = clone(value); store.rows.set(stored[store.keyPath], stored); return stored[store.keyPath];
      }),
      delete: (key) => req(() => { store.rows.delete(key); }),
      clear: () => req(() => { store.rows.clear(); }),
      getAll: () => req(() => [...store.rows.values()].map(clone)),
      index: (name) => ({
        getAll: (value) => req(() => { const ix = indexFor(name); return [...store.rows.values()].filter((r) => r[ix.keyPath] === value).map(clone); }),
      }),
    });
    if (faults.tx) { const err = faults.tx; faults.tx = null; later(() => { failed = err; finished = true; tx.error = err; tx.onabort?.(); }); }
    settleSoon();
    return tx;
  };

  const connect = (name, data) => {
    const db = {
      name, version: data.version, onversionchange: null, onclose: null, closed: false,
      objectStoreNames: { contains: (n) => data.stores.has(n) },
      createObjectStore: (n, { keyPath }) => { const s = { keyPath, indexes: [], rows: new Map() }; data.stores.set(n, s); return { createIndex: (i, kp) => s.indexes.push({ name: i, keyPath: kp }) }; },
      transaction: (n, mode) => {
        if (db.closed) { const e = new Error('The database connection is closing'); e.name = 'InvalidStateError'; throw e; }
        return makeTx(data, n, mode);
      },
      close: () => { db.closed = true; },
    };
    opened.push(db);
    return db;
  };

  return {
    faults, opened,
    // simulate another tab upgrading the database: connections are told to close
    versionChange: () => opened.forEach((d) => { if (!d.closed) d.onversionchange?.(); }),
    existing: (name) => dbs.get(name),
    // seed a database that is already at some version (for "newer database" tests)
    seed: (name, version) => dbs.set(name, { version, stores: new Map() }),
    open(name, version) {
      const req = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      later(() => {
        if (faults.hang) return;
        if (faults.open) { req.error = faults.open; req.onerror?.(); return; }
        if (faults.blocked) { req.onblocked?.(); return; }
        let data = dbs.get(name);
        if (data && data.version > version) { const e = new Error('The requested version is less than the existing version'); e.name = 'VersionError'; req.error = e; req.onerror?.(); return; }
        const oldVersion = data ? data.version : 0;
        if (!data) { data = { version, stores: new Map() }; dbs.set(name, data); }
        const db = connect(name, data);
        req.result = db;
        if (oldVersion < version) { data.version = version; db.version = version; req.onupgradeneeded?.({ oldVersion, newVersion: version }); }
        later(() => req.onsuccess?.());
      });
      return req;
    },
  };
}
