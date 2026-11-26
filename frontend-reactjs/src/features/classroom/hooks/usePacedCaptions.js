import { useEffect, useMemo, useRef, useState } from 'react';

const TICK_MS = 100;
const wordsOf = (text) => text.split(/\s+/).filter(Boolean);

// Reading-pace control. With wpm > 0, new captions are revealed word by word at that speed instead of
// all at once, so a fast speaker doesn't outrun a slow reader. Captions that were already on screen when
// the room opened are shown immediately. Returns { visible, waiting } (waiting = captions not yet started).
export default function usePacedCaptions(captions, wpm, ready) {
  const [revealed, setRevealed] = useState({}); // id -> words revealed so far (fractional)
  const baseline = useRef(null);                // ids that existed when the room opened

  // Set during render (not in an effect) so the very first paint already shows history in full.
  if (ready && baseline.current === null) baseline.current = new Set(captions.map((c) => c.id));

  useEffect(() => {
    if (!wpm) return undefined;
    const perTick = (wpm / 60) * (TICK_MS / 1000);
    const timer = setInterval(() => {
      setRevealed((prev) => {
        const next = captions.find((c) => !baseline.current?.has(c.id) && (prev[c.id] || 0) < wordsOf(c.text).length);
        return next ? { ...prev, [next.id]: (prev[next.id] || 0) + perTick } : prev;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [captions, wpm]);

  return useMemo(() => {
    if (!wpm) return { visible: captions, waiting: 0 };
    const visible = []; let waiting = 0;
    for (const c of captions) {
      if (baseline.current?.has(c.id)) { visible.push(c); continue; }
      const words = wordsOf(c.text);
      const shown = Math.floor(revealed[c.id] || 0);
      if (shown >= words.length) visible.push(c);
      else if (shown > 0) visible.push({ ...c, text: words.slice(0, shown).join(' '), partial: true });
      else waiting += 1;
    }
    return { visible, waiting };
  }, [captions, wpm, revealed]);
}
