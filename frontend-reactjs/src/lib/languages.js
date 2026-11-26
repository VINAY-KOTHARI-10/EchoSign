// The languages offered across the app. They start as the built-in list (so the app works before anything has loaded,
// or if the request fails) and are replaced by the server's list, which reflects what an admin added or switched off
// on the Languages page. Every language selector reads this one list.
import { useSyncExternalStore } from 'react';
import { LANGS } from './index.js';

const BUILT_IN = LANGS.map((l) => ({ ...l }));
const listeners = new Set();
let current = BUILT_IN;

// Speech recognition needs a locale. Known languages keep theirs; a language an admin adds uses its plain code.
const withLocale = (l) => ({ code: l.code, name: l.name, bcp: BUILT_IN.find((b) => b.code === l.code)?.bcp || l.code });

// Accepts the server's list. An empty or malformed answer is ignored, so a bad response never empties the pickers.
export function setLanguages(list) {
  if (!Array.isArray(list) || !list.length) return false;
  const next = list.filter((l) => l && typeof l.code === 'string' && typeof l.name === 'string').map(withLocale);
  if (!next.length) return false;
  current = next;
  LANGS.splice(0, LANGS.length, ...next); // langName() and langBcp() read this array, so they stay correct too
  listeners.forEach((fn) => fn());
  return true;
}

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const getSnapshot = () => current;

export const useLanguages = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
