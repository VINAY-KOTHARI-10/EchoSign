// Drives a TranslationStore: decides when to send a batch, sends one request at a time, applies the reply, and
// schedules the next automatic retry. No React, and the network call, clock and timers are injected, so the behaviour
// ("a re-render never causes a request", "a changed language ignores late replies") is unit-tested.
import { TranslationStore } from './translationState.js';

export const BATCH_PAUSE_MS = 500; // a burst of captions goes out as one request

export class TranslationRunner {
  // translate(code, texts, target) -> Promise<{ data: { translations, failed } }>
  constructor({ translate, store, schedule = setTimeout, cancel = clearTimeout, now = Date.now, onChange = () => {} }) {
    this.translate = translate;
    this.store = store || new TranslationStore();
    this.schedule = schedule; this.cancel = cancel; this.now = now; this.onChange = onChange;
    this.code = null; this.target = ''; this.captions = [];
    this.inFlight = false; this.epoch = 0; this.timer = null; this.requests = 0;
  }

  // New classroom or language: forget everything, and ignore any reply that is still on its way.
  setContext(code, target) {
    this.epoch += 1;
    this.code = code; this.target = target;
    this.store.reset();
    this.inFlight = false;
    this._clear();
    this.onChange();
  }

  // Call whenever the captions may have changed (it is safe, and cheap, to call on every render).
  update(captions) {
    this.captions = captions;
    this.store.prune(captions);
    this._clear();
    if (!this.target || this.inFlight) return; // re-evaluated when the running request finishes
    let delay = null;
    if (this.store.due(captions).length) delay = BATCH_PAUSE_MS;
    else { const next = this.store.nextRetryAt(); if (next !== null) delay = Math.max(0, next - this.now()) + 50; }
    if (delay !== null) this.timer = this.schedule(() => { this.timer = null; this.tick(); }, delay);
  }

  async tick() {
    if (!this.target || this.inFlight) return;
    const items = this.store.due(this.captions);
    if (!items.length) return;
    const mine = this.epoch;
    this.inFlight = true;
    this.requests += 1;
    this.store.markPending(items);
    this.onChange();
    try {
      const res = await this.translate(this.code, items.map((i) => i.text), this.target);
      if (mine !== this.epoch) return;
      this.store.applyResult(items, res.data);
    } catch (err) {
      if (mine !== this.epoch) return;
      this.store.applyError(items, err);
    } finally {
      if (mine === this.epoch) { this.inFlight = false; this.onChange(); this.update(this.captions); }
    }
  }

  // Manual retry of every failed caption.
  retry() {
    if (!this.store.retryFailed()) return 0;
    this.onChange();
    this._clear();
    this.tick();
    return 1;
  }

  _clear() { if (this.timer !== null) { this.cancel(this.timer); this.timer = null; } }
  dispose() { this.epoch += 1; this._clear(); }
}
