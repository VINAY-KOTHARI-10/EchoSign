// Captions waiting to be confirmed by the server. Each one has an id (the idempotency key), so sending it again after
// a lost reply can never store it twice. Pure bookkeeping (no sockets), so the retry rules are unit-tested.

export const RETRY_MS = [1500, 3000, 6000, 10000]; // back-off between attempts; the last value repeats

export class Outbox {
  constructor(newId) {
    this.newId = newId;
    this.items = new Map(); // clientId -> { text, source, tries, nextAt, busy }
  }

  get size() { return this.items.size; }

  add(text, source) {
    const clientId = this.newId();
    this.items.set(clientId, { text, source, tries: 0, nextAt: 0, busy: false });
    return clientId;
  }

  // Items ready to send now. They are marked busy so the same item is never sent twice at once.
  due(now = Date.now()) {
    const out = [];
    this.items.forEach((item, clientId) => {
      if (item.busy || now < item.nextAt) return;
      item.busy = true;
      out.push([clientId, item]);
    });
    return out;
  }

  settle(clientId) { this.items.delete(clientId); }

  // The attempt failed: wait a little longer before the next one. Returns the number of failed attempts.
  fail(clientId, now = Date.now()) {
    const item = this.items.get(clientId);
    if (!item) return 0;
    item.busy = false;
    item.tries += 1;
    item.nextAt = now + RETRY_MS[Math.min(item.tries - 1, RETRY_MS.length - 1)];
    return item.tries;
  }

  // Nothing was sent (for example, offline): try again at the next opportunity without counting a failure.
  release(clientId) {
    const item = this.items.get(clientId);
    if (item) item.busy = false;
  }
}
