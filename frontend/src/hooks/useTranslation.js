import { useEffect, useRef, useState } from 'react';
import * as api from '../api';

// Translates captions into `target` (a language name) in small batches. Returns { id|text: translation }.
// Edited captions are re-translated because the key includes the text.
export const translationKey = (c) => `${c.id}|${c.text}`;

export default function useTranslation(code, captions, target) {
  const [map, setMap] = useState({});
  const [error, setError] = useState('');
  const pending = useRef(new Set());
  const failures = useRef(0);

  // A new target language starts a fresh set of translations.
  useEffect(() => { setMap({}); setError(''); pending.current = new Set(); failures.current = 0; }, [target, code]);

  useEffect(() => {
    if (!target || failures.current >= 3) return undefined;
    const todo = captions.filter((c) => !map[translationKey(c)] && !pending.current.has(translationKey(c))).slice(-20);
    if (!todo.length) return undefined;

    const timer = setTimeout(async () => {
      todo.forEach((c) => pending.current.add(translationKey(c)));
      try {
        const res = await api.classrooms.translate(code, todo.map((c) => c.text), target);
        setMap((m) => {
          const next = { ...m };
          todo.forEach((c, i) => { next[translationKey(c)] = res.data.translations[i]; });
          return next;
        });
        failures.current = 0; setError('');
      } catch (err) {
        failures.current += 1;
        setError(err.message);
      } finally {
        todo.forEach((c) => pending.current.delete(translationKey(c)));
      }
    }, 500); // wait a moment so a burst of captions goes out as one request
    return () => clearTimeout(timer);
  }, [captions, target, code, map]);

  return { translations: map, error };
}
