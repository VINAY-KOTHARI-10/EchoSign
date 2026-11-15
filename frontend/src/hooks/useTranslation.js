import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api';
import { keyOf } from '../lib/translationState';
import { TranslationRunner } from '../lib/translationRunner';

// Translates captions into `target` (a language name) in small batches, tracking every caption separately.
// Returns:
//   translations  { key: text }  only real, successful translations
//   statusOf(c)   'none' | 'pending' | 'retrying' | 'failed' | 'done'
//   summary       { pending, failed, retrying, exhausted, error, nextRetryAt }
//   retry()       manual retry of every failed caption
// A caption that cannot be translated is shown as untranslated with its status, never as if the original were a
// translation. The original transcript is never modified. All the rules live in lib/translationState.js and
// lib/translationRunner.js (both unit-tested); this hook only connects them to React.
export const translationKey = keyOf;

export default function useTranslation(code, captions, target) {
  const [version, setVersion] = useState(0);
  const runnerRef = useRef(null);
  if (!runnerRef.current) {
    runnerRef.current = new TranslationRunner({ translate: (c, texts, t) => api.classrooms.translate(c, texts, t), onChange: () => setVersion((v) => v + 1) });
  }
  const runner = runnerRef.current;

  useEffect(() => { runner.setContext(code, target); return () => runner.dispose(); }, [runner, code, target]);
  // Safe on every change: the runner sends nothing for pending, done, exhausted or still-waiting captions.
  useEffect(() => { runner.update(captions); }, [runner, captions, version]);

  const retry = useCallback(() => runner.retry(), [runner]);
  const translations = useMemo(() => {
    const out = {};
    captions.forEach((c) => { const t = runner.store.translationFor(c); if (t) out[keyOf(c)] = t; });
    return out;
  }, [runner, captions, version]); // eslint-disable-line
  const statusOf = useCallback((c) => runner.store.statusFor(c), [runner, version]); // eslint-disable-line
  const summary = runner.store.summary();
  return { translations, statusOf, summary, error: summary.error, retry };
}
