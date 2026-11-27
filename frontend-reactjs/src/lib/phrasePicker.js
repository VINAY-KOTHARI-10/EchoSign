// Random phrase order for the Practice page: every phrase in a set once, in a different order each time, never the one
// just shown, and a short memory of recent phrases so the server can avoid repeating them in the next set.

export const RECENT_KEY = 'lw_recent_phrases';
export const RECENT_MAX = 30;

/** A random index in 0..count-1 that is not in `seen`; null when every one has been seen. */
export function pickUnseen(count, seen, rng = Math.random) {
  const left = [];
  for (let i = 0; i < count; i++) if (!seen.has(i)) left.push(i);
  if (!left.length) return null;
  return left[Math.floor(rng() * left.length)];
}

const safeStorage = (storage) => { try { return storage || (typeof localStorage !== 'undefined' ? localStorage : null); } catch { return null; } };

export function loadRecent(storage) {
  try { const raw = safeStorage(storage)?.getItem(RECENT_KEY); const list = raw ? JSON.parse(raw) : []; return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []; }
  catch { return []; }
}

export function rememberPhrase(text, storage) {
  const s = safeStorage(storage);
  if (!s || !text) return;
  try {
    const list = loadRecent(s).filter((x) => x !== text);
    list.unshift(text);
    s.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch { /* storage unavailable: the server just avoids fewer repeats */ }
}

/** The recent phrases as one string for the request (the server splits on "|"). */
export const avoidParam = (list, max = 15) => list.slice(0, max).map((x) => x.replace(/\|/g, ' ')).join('|');
