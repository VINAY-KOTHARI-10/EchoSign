import { useCallback, useState } from 'react';

const KEY = 'lw_cc_prefs';

export const FONTS = {
  standard: { label: 'Standard', css: "var(--font-display)" },
  lexend: { label: 'Lexend (easier reading)', css: "'Lexend', sans-serif" },
  atkinson: { label: 'Atkinson Hyperlegible', css: "'Atkinson Hyperlegible', sans-serif" },
};

export const THEMES = [
  { id: 'violet', label: 'Violet', bg: 'linear-gradient(135deg, #2b1a78 0%, #4b2cd6 58%, #6a4df0 100%)', fg: '#ffffff' },
  { id: 'light', label: 'Light', bg: '#ffffff', fg: '#17131f' },
  { id: 'dark', label: 'Dark', bg: '#17131f', fg: '#ffffff' },
  { id: 'contrast', label: 'Yellow on black', bg: '#000000', fg: '#ffeb3b' },
  { id: 'cream', label: 'Cream (low glare)', bg: '#fbf3dc', fg: '#2b2a26' },
];

export const PACES = [
  { wpm: 0, label: 'Instant' },
  { wpm: 140, label: 'Slow' },
  { wpm: 200, label: 'Medium' },
  { wpm: 260, label: 'Fast' },
];

export const DEFAULTS = {
  size: 32,
  theme: 'violet',
  showNames: true,
  font: 'standard',
  lineHeight: 1.35,
  letterSpacing: 0,
  paceWpm: 0,       // 0 = show captions as soon as they arrive
  translateTo: '',  // language name to translate captions into, '' = off
  alerts: { name: true, question: false, words: '', flash: true, vibrate: true },
};

const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {};
    return { ...DEFAULTS, ...saved, alerts: { ...DEFAULTS.alerts, ...(saved.alerts || {}) } };
  } catch { return DEFAULTS; }
};

// Per-viewer caption display settings, remembered in this browser.
export default function useDisplayPrefs() {
  const [prefs, setPrefs] = useState(load);

  const update = useCallback((patch) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch, alerts: { ...prev.alerts, ...(patch.alerts || {}) } };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);

  const reset = useCallback(() => update({ ...DEFAULTS }), [update]);
  return [prefs, update, reset];
}
