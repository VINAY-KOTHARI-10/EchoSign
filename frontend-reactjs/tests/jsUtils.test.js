import test from 'node:test';
import assert from 'node:assert/strict';
import { average, deepCopy, groupBy, insertAt, omit, pick, removeById, sameReference, shallowCopy, shallowEqual, sum, unique, updateById } from '../src/lib/jsUtils.js';

test('sum, average, unique', () => {
  assert.equal(sum(1, 2, 3), 6);
  assert.equal(sum(), 0);
  assert.equal(average([2, 4, 6]), 4);
  assert.equal(average([]), 0);
  assert.deepEqual(unique([1, 2, 2, 3, 1]), [1, 2, 3]);
});

test('groupBy keeps first-appearance order', () => {
  const g = groupBy([{ l: 'es', a: 1 }, { l: 'en', a: 2 }, { l: 'es', a: 3 }], (x) => x.l);
  assert.deepEqual(Object.keys(g), ['es', 'en']);
  assert.equal(g.es.length, 2);
});

test('pick and omit return copies', () => {
  const o = { a: 1, b: 2, c: 3 };
  assert.deepEqual(pick(o, 'a', 'c', 'z'), { a: 1, c: 3 });
  assert.deepEqual(omit(o, 'b'), { a: 1, c: 3 });
  assert.deepEqual(o, { a: 1, b: 2, c: 3 }); // the original is untouched
});

test('immutable array updates never change the input', () => {
  const items = Object.freeze([{ id: 1, n: 'a' }, { id: 2, n: 'b' }]);
  const updated = updateById(items, 2, { n: 'B' });
  assert.deepEqual(updated, [{ id: 1, n: 'a' }, { id: 2, n: 'B' }]);
  assert.notEqual(updated, items);
  assert.equal(updated[0], items[0]); // untouched items keep their reference
  assert.deepEqual(removeById(items, 1), [{ id: 2, n: 'b' }]);
  assert.deepEqual(insertAt([1, 3], 1, 2), [1, 2, 3]);
});

test('shallow copy shares nested objects, deep copy does not', () => {
  const original = { inner: { x: 1 } };
  const shallow = shallowCopy(original);
  const deep = deepCopy(original);
  assert.equal(shallow.inner, original.inner);
  assert.notEqual(deep.inner, original.inner);
  assert.deepEqual(deep, original);
});

test('referential equality versus shallowEqual', () => {
  const a = { x: 1, y: 2 };
  assert.equal(sameReference(a, a), true);
  assert.equal(sameReference(a, { x: 1, y: 2 }), false);
  assert.equal(shallowEqual(a, { x: 1, y: 2 }), true);
  assert.equal(shallowEqual(a, { x: 1, y: 3 }), false);
});
