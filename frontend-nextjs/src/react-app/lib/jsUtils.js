// Small ES6+ utility functions (INT252, Unit I): arrow functions, array methods, destructuring, spread and rest,
// ES modules, and immutability (nothing here changes the data it is given; each returns a new value).

// Rest parameters: any number of arguments.
export const sum = (...numbers) => numbers.reduce((total, n) => total + n, 0);

// Array methods: map + reduce.
export const average = (numbers) => (numbers.length ? sum(...numbers) / numbers.length : 0);

// Set + spread: remove repeats, keep the first of each.
export const unique = (items) => [...new Set(items)];

// reduce into an object: { key: [items...] }. Insertion order of keys follows first appearance.
export const groupBy = (items, keyOf) => items.reduce((groups, item) => {
  const key = keyOf(item);
  (groups[key] ||= []).push(item);
  return groups;
}, {});

// Destructuring + rest: a copy of the object without the listed keys.
export const omit = (object, ...keys) => {
  const copy = { ...object };
  keys.forEach((key) => { delete copy[key]; });
  return copy;
};

// Object.fromEntries + filter: a copy with only the listed keys.
export const pick = (object, ...keys) => Object.fromEntries(keys.filter((key) => key in object).map((key) => [key, object[key]]));

// Immutable updates: return a NEW array, leave the old one untouched (so React sees a new reference and re-renders).
export const updateById = (items, id, changes) => items.map((item) => (item.id === id ? { ...item, ...changes } : item));
export const removeById = (items, id) => items.filter((item) => item.id !== id);
export const insertAt = (items, index, item) => [...items.slice(0, index), item, ...items.slice(index)];

// Shallow copy (spread) copies one level; the nested objects are still shared. A deep copy copies every level.
export const shallowCopy = (value) => (Array.isArray(value) ? [...value] : { ...value });
export const deepCopy = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

// Referential equality (===) answers "is it the same object?"; shallowEqual answers "does it hold the same values one level deep?".
export const sameReference = (a, b) => Object.is(a, b);
export const shallowEqual = (a, b) => {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return keysA.length === keysB.length && keysA.every((key) => Object.is(a[key], b[key]));
};
