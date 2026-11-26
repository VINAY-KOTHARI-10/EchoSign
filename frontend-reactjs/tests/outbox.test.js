// The retry rules for captions that have not been confirmed yet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Outbox, RETRY_MS } from '../src/lib/outbox.js';

const make = () => { let n = 0; return new Outbox(() => `id-${++n}`); };

test('each caption gets its own id and is sent once at a time', () => {
  const o = make();
  const a = o.add('hello', 'TEXT');
  const b = o.add('world', 'SPEECH');
  assert.notEqual(a, b);
  assert.equal(o.size, 2);
  assert.equal(o.due(0).length, 2);
  assert.equal(o.due(0).length, 0, 'items in flight are not handed out again');
});

test('a confirmed caption leaves the outbox', () => {
  const o = make();
  const id = o.add('x', 'TEXT');
  o.due(0);
  o.settle(id);
  assert.equal(o.size, 0);
});

test('a failed caption waits, with growing delays, then is retried with the SAME id', () => {
  const o = make();
  const id = o.add('x', 'TEXT');
  let now = 1000;
  o.due(now);
  assert.equal(o.fail(id, now), 1);
  assert.equal(o.due(now + RETRY_MS[0] - 1).length, 0, 'not before the back-off');
  const [[again]] = o.due(now + RETRY_MS[0]);
  assert.equal(again, id);
  now += RETRY_MS[0];
  o.fail(id, now);
  assert.equal(o.due(now + RETRY_MS[1] - 1).length, 0);
  assert.equal(o.due(now + RETRY_MS[1]).length, 1);
});

test('the back-off stops growing at the last value', () => {
  const o = make();
  const id = o.add('x', 'TEXT');
  for (let i = 0; i < 10; i += 1) { o.due(1e9 * (i + 1)); o.fail(id, 0); }
  assert.equal(o.items.get(id).nextAt, RETRY_MS[RETRY_MS.length - 1]);
});

test('release (offline) retries at once without counting a failure', () => {
  const o = make();
  const id = o.add('x', 'TEXT');
  o.due(0);
  o.release(id);
  assert.equal(o.items.get(id).tries, 0);
  assert.equal(o.due(0).length, 1);
});

test('failing an unknown id is harmless', () => {
  assert.equal(make().fail('nope'), 0);
});
