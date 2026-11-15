// Per-caption translation state for one classroom and one target language. Pure logic (no React, no network) so the
// retry rules are unit-tested.
//
// A caption is identified by its id AND its text, so an edited caption is a new entry and is translated again.
// Every entry is in exactly one state:
//   none      not requested yet
//   pending   a request containing it is running
//   done      a real translation was returned (only then is `translationFor` non-null)
//   failed    the server could not translate it (or the whole request failed); it is retried automatically with
//             exponential back-off up to `maxAttempts`, and after that waits for a manual retry
// "retrying" is a failed entry whose next automatic attempt is scheduled. A missing, null or blank translation is a
// failure, never a success, and the original text is never shown as if it were a translation.

export const keyOf = (c) => `${c.id}|${c.text}`;

export const DEFAULTS = { maxAttempts: 4, baseDelayMs: 2000, maxDelayMs: 60000, batchSize: 20 };

// Errors that retrying cannot fix: do not hammer the server with them.
const PERMANENT = new Set([400, 401, 403, 404, 503]);

export class TranslationStore {
  constructor(options = {}, now = () => Date.now()) {
    this.opts = { ...DEFAULTS, ...options };
    this.now = now;
    this.entries = new Map(); // key -> { status, text, translation, attempts, nextAt, permanent }
    this.lastError = '';
  }

  reset() { this.entries.clear(); this.lastError = ''; }

  get(c) { return this.entries.get(keyOf(c)); }
  statusFor(c) {
    const e = this.get(c);
    if (!e) return 'none';
    if (e.status === 'failed' && !e.permanent && e.attempts < this.opts.maxAttempts) return 'retrying';
    return e.status;
  }
  translationFor(c) { const e = this.get(c); return e && e.status === 'done' ? e.translation : null; }

  // Captions to send now, grouped by identical text (one request item per distinct text), newest first, at most batchSize.
  // Never returns pending or done entries, failed entries still waiting for their back-off, or exhausted ones.
  due(captions) {
    const t = this.now();
    const groups = new Map(); // text -> captions
    const wanted = [];
    for (let i = captions.length - 1; i >= 0 && wanted.length < this.opts.batchSize * 4; i -= 1) {
      const c = captions[i];
      const e = this.get(c);
      const ok = !e || (e.status === 'failed' && !e.permanent && e.attempts < this.opts.maxAttempts && t >= e.nextAt);
      if (ok) wanted.push(c);
    }
    wanted.forEach((c) => { if (!groups.has(c.text)) groups.set(c.text, []); groups.get(c.text).push(c); });
    return [...groups.entries()].slice(0, this.opts.batchSize).map(([text, caps]) => ({ text, captions: caps }));
  }

  markPending(items) {
    items.forEach(({ text, captions }) => captions.forEach((c) => {
      const prev = this.get(c);
      this.entries.set(keyOf(c), { status: 'pending', text, translation: null, attempts: prev ? prev.attempts : 0, nextAt: 0, permanent: false });
    }));
  }

  // The server answered. `res` = { translations: (string|null)[], failed: number[] } for the items in order.
  applyResult(items, res) {
    const list = Array.isArray(res && res.translations) ? res.translations : [];
    const failedIdx = new Set(Array.isArray(res && res.failed) ? res.failed : []);
    let anyFailed = false;
    items.forEach((item, i) => {
      const tr = list[i];
      const ok = !failedIdx.has(i) && typeof tr === 'string' && tr.trim().length > 0;
      item.captions.forEach((c) => { if (ok) this._succeed(c, item.text, tr); else { this._fail(c, item.text); anyFailed = true; } });
    });
    this.lastError = anyFailed ? 'Some captions could not be translated.' : '';
  }

  // The whole request failed (network, rate limit, server error). `status` is the HTTP status when there was one.
  applyError(items, err) {
    const status = err && err.status;
    const permanent = PERMANENT.has(status);
    items.forEach((item) => item.captions.forEach((c) => this._fail(c, item.text, permanent)));
    this.lastError = (err && err.message) || 'Translation is unavailable right now.';
  }

  _succeed(c, text, translation) {
    this.entries.set(keyOf(c), { status: 'done', text, translation, attempts: 0, nextAt: 0, permanent: false });
  }

  _fail(c, text, permanent = false) {
    const prev = this.get(c);
    const attempts = (prev ? prev.attempts : 0) + 1;
    const delay = Math.min(this.opts.maxDelayMs, this.opts.baseDelayMs * 2 ** (attempts - 1));
    this.entries.set(keyOf(c), { status: 'failed', text, translation: null, attempts, nextAt: this.now() + delay, permanent });
  }

  // Manual retry: every failed caption becomes eligible again immediately, with a fresh attempt budget.
  retryFailed() {
    let n = 0;
    this.entries.forEach((e) => { if (e.status === 'failed') { e.attempts = 0; e.nextAt = 0; e.permanent = false; n += 1; } });
    if (n) this.lastError = '';
    return n;
  }

  // Forget entries for captions that no longer exist or whose text changed (keeps the map from growing for ever).
  prune(captions) {
    const live = new Set(captions.map(keyOf));
    this.entries.forEach((_, k) => { if (!live.has(k)) this.entries.delete(k); });
  }

  // When the earliest automatic retry is due (ms timestamp), or null when none is scheduled.
  nextRetryAt() {
    let next = null;
    this.entries.forEach((e) => {
      if (e.status === 'failed' && !e.permanent && e.attempts < this.opts.maxAttempts && (next === null || e.nextAt < next)) next = e.nextAt;
    });
    return next;
  }

  summary() {
    let pending = 0; let failed = 0; let retrying = 0; let exhausted = 0; let done = 0;
    this.entries.forEach((e) => {
      if (e.status === 'pending') pending += 1;
      else if (e.status === 'done') done += 1;
      else if (e.status === 'failed') {
        failed += 1;
        if (!e.permanent && e.attempts < this.opts.maxAttempts) retrying += 1; else exhausted += 1;
      }
    });
    return { pending, failed, retrying, exhausted, done, error: this.lastError, nextRetryAt: this.nextRetryAt() };
  }
}
