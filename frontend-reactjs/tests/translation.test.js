// Translation state and orchestration. The network call, clock and timers are test doubles, so these check the RULES:
// per-caption state, bounded back-off, no resends on re-render, edited captions, language switching.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TranslationStore, keyOf } from '../src/lib/translationState.js';
import { TranslationRunner, BATCH_PAUSE_MS } from '../src/lib/translationRunner.js';

const cap = (id, text) => ({ id, text });
const clock = () => { const c = { t: 1000, now: () => c.t, advance(ms) { c.t += ms; } }; return c; };

// A manual scheduler: timers only fire when the test says so.
const scheduler = () => {
  const s = { timers: new Map(), next: 1 };
  s.schedule = (fn, ms) => { const id = s.next++; s.timers.set(id, { fn, ms }); return id; };
  s.cancel = (id) => s.timers.delete(id);
  s.fire = async () => { const all = [...s.timers.entries()]; s.timers.clear(); for (const [, t] of all) await t.fn(); await Promise.resolve(); };
  s.pending = () => s.timers.size;
  return s;
};

const setup = (translate, opts = {}) => {
  const c = clock(); const s = scheduler();
  const store = new TranslationStore({ baseDelayMs: 1000, maxAttempts: 3, ...opts }, c.now);
  const runner = new TranslationRunner({ translate, store, schedule: s.schedule, cancel: s.cancel, now: c.now });
  runner.setContext('ABC123', 'Hindi');
  return { c, s, store, runner };
};
const reply = (translations, failed = []) => async () => ({ data: { translations, failed } });
const flush = () => new Promise((r) => setImmediate(r));

// ── store: results ──
test('a fully successful batch marks every caption done', () => {
  const store = new TranslationStore();
  const items = [{ text: 'Hello', captions: [cap(1, 'Hello')] }, { text: 'Bye', captions: [cap(2, 'Bye')] }];
  store.markPending(items);
  store.applyResult(items, { translations: ['नमस्ते', 'अलविदा'], failed: [] });
  assert.equal(store.translationFor(cap(1, 'Hello')), 'नमस्ते');
  assert.equal(store.statusFor(cap(2, 'Bye')), 'done');
  assert.equal(store.summary().failed, 0);
});

test('a partial batch keeps the successes and fails only the rest', () => {
  const store = new TranslationStore();
  const items = [{ text: 'a', captions: [cap(1, 'a')] }, { text: 'b', captions: [cap(2, 'b')] }, { text: 'c', captions: [cap(3, 'c')] }];
  store.markPending(items);
  store.applyResult(items, { translations: ['A', null, 'C'], failed: [1] });
  assert.equal(store.translationFor(cap(1, 'a')), 'A');
  assert.equal(store.translationFor(cap(3, 'c')), 'C');
  assert.equal(store.translationFor(cap(2, 'b')), null);
  assert.equal(store.statusFor(cap(2, 'b')), 'retrying');
});

test('a null, blank or missing value is a failure, never a success (even if the server forgot to list it)', () => {
  const store = new TranslationStore();
  const items = ['a', 'b', 'c', 'd'].map((t, i) => ({ text: t, captions: [cap(i, t)] }));
  store.markPending(items);
  store.applyResult(items, { translations: ['A', null, '   '], failed: [] }); // d is missing entirely
  assert.equal(store.statusFor(cap(0, 'a')), 'done');
  ['b', 'c', 'd'].forEach((t, k) => assert.notEqual(store.statusFor(cap(k + 1, t)), 'done', t));
  ['b', 'c', 'd'].forEach((t, k) => assert.equal(store.translationFor(cap(k + 1, t)), null));
});

test('when every translation fails nothing is shown as translated', () => {
  const store = new TranslationStore();
  const items = [{ text: 'a', captions: [cap(1, 'a')] }];
  store.markPending(items);
  store.applyResult(items, { translations: [null], failed: [0] });
  assert.equal(store.translationFor(cap(1, 'a')), null);
  assert.equal(store.summary().failed, 1);
  assert.match(store.summary().error, /could not be translated/);
});

test('a malformed reply (no arrays) fails the items instead of crashing', () => {
  const store = new TranslationStore();
  const items = [{ text: 'a', captions: [cap(1, 'a')] }];
  store.markPending(items);
  store.applyResult(items, undefined);
  assert.equal(store.statusFor(cap(1, 'a')), 'retrying');
});

// ── store: back-off ──
test('failed captions wait with exponential back-off, then stop after maxAttempts until a manual retry', () => {
  const c = clock();
  const store = new TranslationStore({ baseDelayMs: 1000, maxAttempts: 3 }, c.now);
  const x = cap(1, 'x');
  const fail = () => { const items = store.due([x]); store.markPending(items); store.applyError(items, new Error('boom')); };
  fail();                                                  // attempt 1 -> waits 1000
  assert.equal(store.due([x]).length, 0);
  c.advance(999); assert.equal(store.due([x]).length, 0);
  c.advance(1); fail();                                    // attempt 2 -> waits 2000
  c.advance(1999); assert.equal(store.due([x]).length, 0);
  c.advance(1); fail();                                    // attempt 3 -> exhausted
  assert.equal(store.statusFor(x), 'failed');
  c.advance(10 * 60 * 1000);
  assert.equal(store.due([x]).length, 0, 'no automatic request after the attempt budget is used');
  assert.equal(store.summary().exhausted, 1);
  assert.equal(store.nextRetryAt(), null);
});

test('manual retry makes failed captions eligible again with a fresh budget', () => {
  const c = clock();
  const store = new TranslationStore({ baseDelayMs: 1000, maxAttempts: 1 }, c.now);
  const x = cap(1, 'x');
  const items = store.due([x]); store.markPending(items); store.applyError(items, new Error('boom'));
  assert.equal(store.due([x]).length, 0);
  assert.equal(store.retryFailed(), 1);
  assert.equal(store.due([x]).length, 1);
});

test('permanent errors (not configured, forbidden, bad request) are not retried automatically', () => {
  for (const status of [400, 403, 404, 503]) {
    const c = clock();
    const store = new TranslationStore({}, c.now);
    const x = cap(1, 'x');
    const items = store.due([x]); store.markPending(items); store.applyError(items, Object.assign(new Error('nope'), { status }));
    c.advance(10 * 60 * 1000);
    assert.equal(store.due([x]).length, 0, `status ${status}`);
    assert.equal(store.summary().exhausted, 1);
  }
});

test('a rate limit (429) is retried after the back-off', () => {
  const c = clock();
  const store = new TranslationStore({ baseDelayMs: 1000 }, c.now);
  const x = cap(1, 'x');
  const items = store.due([x]); store.markPending(items); store.applyError(items, Object.assign(new Error('slow down'), { status: 429 }));
  c.advance(1000);
  assert.equal(store.due([x]).length, 1);
});

// ── store: identity ──
test('an edited caption is a new entry and is translated again; the old entry is pruned', () => {
  const store = new TranslationStore();
  const before = cap(1, 'Helo');
  const items = [{ text: 'Helo', captions: [before] }];
  store.markPending(items); store.applyResult(items, { translations: ['x'], failed: [] });
  const after = cap(1, 'Hello');
  assert.notEqual(keyOf(before), keyOf(after));
  assert.equal(store.statusFor(after), 'none');
  assert.equal(store.due([after]).length, 1);
  store.prune([after]);
  assert.equal(store.entries.size, 0, 'stale entry removed');
});

test('captions with the same text are sent once and share the result', () => {
  const store = new TranslationStore();
  const a = cap(1, 'Thank you'); const b = cap(2, 'Thank you');
  const items = store.due([a, b]);
  assert.equal(items.length, 1);
  assert.equal(items[0].captions.length, 2);
  store.markPending(items); store.applyResult(items, { translations: ['धन्यवाद'], failed: [] });
  assert.equal(store.translationFor(a), 'धन्यवाद');
  assert.equal(store.translationFor(b), 'धन्यवाद');
});

test('batches are bounded and newest captions go first', () => {
  const store = new TranslationStore({ batchSize: 3 });
  const caps = Array.from({ length: 10 }, (_, i) => cap(i, `line ${i}`));
  const items = store.due(caps);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.text), ['line 9', 'line 8', 'line 7']);
});

// ── runner ──
test('a re-render (calling update again and again) sends exactly one request', async () => {
  let calls = 0;
  const { s, runner } = setup(async (...a) => { calls += 1; return reply(['A'], [])(...a); });
  const caps = [cap(1, 'a')];
  for (let i = 0; i < 25; i += 1) runner.update(caps);
  assert.equal(s.pending(), 1, 'one scheduled send, not 25');
  await s.fire(); await flush();
  for (let i = 0; i < 25; i += 1) runner.update(caps);
  assert.equal(s.pending(), 0, 'nothing left to do');
  assert.equal(calls, 1);
  assert.equal(runner.store.translationFor(caps[0]), 'A');
});

test('retry after failure: back-off, then the same caption is sent again and succeeds', async () => {
  const answers = [reply([null], [0]), reply(['OK'], [])];
  const sent = [];
  const { c, s, runner } = setup(async (code, texts, target) => { sent.push(texts); return answers.shift()(); });
  const caps = [cap(1, 'a')];
  runner.update(caps); await s.fire(); await flush();
  assert.equal(runner.store.statusFor(caps[0]), 'retrying');
  assert.equal(s.pending(), 1, 'a retry is scheduled');
  c.advance(1100); await s.fire(); await flush();
  assert.deepEqual(sent, [['a'], ['a']]);
  assert.equal(runner.store.translationFor(caps[0]), 'OK');
  assert.equal(s.pending(), 0);
});

test('automatic retries are bounded: after maxAttempts no further requests are made', async () => {
  let calls = 0;
  const { c, s, runner } = setup(async () => { calls += 1; return { data: { translations: [null], failed: [0] } }; }, { maxAttempts: 3 });
  const caps = [cap(1, 'a')];
  runner.update(caps);
  for (let i = 0; i < 12; i += 1) { c.advance(70000); await s.fire(); await flush(); runner.update(caps); }
  assert.equal(calls, 3);
  assert.equal(s.pending(), 0, 'no timer left running');
});

test('manual retry sends the failed captions again, and keeps successes untouched', async () => {
  const log = [];
  const { s, runner } = setup(async (code, texts) => {
    log.push(texts);
    // the newest caption is sent first, so answer by text: 'a' succeeds, 'b' fails on the first request
    if (log.length === 1) { const tr = texts.map((t) => (t === 'a' ? 'A' : null)); return { data: { translations: tr, failed: tr.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0) } }; }
    return { data: { translations: ['B'], failed: [] } };
  }, { maxAttempts: 1 });
  const caps = [cap(1, 'a'), cap(2, 'b')];
  runner.update(caps); await s.fire(); await flush();
  assert.equal(runner.store.statusFor(caps[1]), 'failed');
  runner.retry(); await flush();
  assert.equal(runner.store.translationFor(caps[0]), 'A', 'success from the first batch is preserved');
  assert.equal(runner.store.translationFor(caps[1]), 'B');
  assert.equal(log.length, 2);
  assert.deepEqual(log[1], ['b'], 'only the failed caption is resent');
});

test('only one request is in flight at a time', async () => {
  let release; let concurrent = 0; let peak = 0;
  const { s, runner } = setup(() => new Promise((resolve) => { concurrent += 1; peak = Math.max(peak, concurrent); release = () => { concurrent -= 1; resolve({ data: { translations: ['x'], failed: [] } }); }; }));
  const caps = [cap(1, 'a')];
  runner.update(caps); await s.fire();
  runner.update([...caps, cap(2, 'b')]); await s.fire(); // more captions arrive while the first request is still running
  assert.equal(peak, 1);
  release(); await flush();
});

test('switching language discards the old state, ignores a late reply and translates into the new language', async () => {
  const seen = []; let releaseFirst;
  const { s, runner } = setup((code, texts, target) => {
    seen.push(target);
    if (seen.length === 1) return new Promise((resolve) => { releaseFirst = () => resolve({ data: { translations: ['hindi'], failed: [] } }); });
    return Promise.resolve({ data: { translations: ['spanish'], failed: [] } });
  });
  const caps = [cap(1, 'a')];
  runner.update(caps); await s.fire();                     // request for Hindi is running
  runner.setContext('ABC123', 'Spanish');                  // user switches language
  runner.update(caps); await s.fire(); await flush();
  releaseFirst(); await flush();                           // the stale Hindi reply arrives late
  assert.deepEqual(seen, ['Hindi', 'Spanish']);
  assert.equal(runner.store.translationFor(caps[0]), 'spanish', 'the late Hindi reply was ignored');
});

test('switching classroom resets state; turning translation off sends nothing', async () => {
  let calls = 0;
  const { s, runner } = setup(async (...a) => { calls += 1; return reply(['A'], [])(...a); });
  const caps = [cap(1, 'a')];
  runner.update(caps); await s.fire(); await flush();
  runner.setContext('OTHER1', 'Hindi');
  assert.equal(runner.store.entries.size, 0);
  runner.setContext('OTHER1', '');
  runner.update(caps);
  assert.equal(s.pending(), 0);
  assert.equal(calls, 1);
});

test('a network error is reported, keeps live captions untouched, and is retried within the bound', async () => {
  let calls = 0;
  const { c, s, runner } = setup(async () => { calls += 1; if (calls === 1) throw Object.assign(new Error('Failed to fetch'), { status: undefined }); return { data: { translations: ['ok'], failed: [] } }; });
  const caps = [cap(1, 'a')];
  runner.update(caps); await s.fire(); await flush();
  assert.equal(runner.store.summary().error, 'Failed to fetch');
  assert.equal(caps[0].text, 'a', 'the original caption is untouched');
  c.advance(1100); await s.fire(); await flush();
  assert.equal(runner.store.translationFor(caps[0]), 'ok');
});

test('the pause before sending lets a burst of captions go out together', async () => {
  const batches = [];
  const { s, runner } = setup(async (code, texts) => { batches.push(texts.length); return { data: { translations: texts.map((t) => t.toUpperCase()), failed: [] } }; });
  const caps = [];
  for (let i = 0; i < 5; i += 1) { caps.push(cap(i, `w${i}`)); runner.update([...caps]); }
  assert.equal(s.pending(), 1);
  assert.equal([...s.timers.values()][0].ms, BATCH_PAUSE_MS);
  await s.fire(); await flush();
  assert.deepEqual(batches, [5]);
});
