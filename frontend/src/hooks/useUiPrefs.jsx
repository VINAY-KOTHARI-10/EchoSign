import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const KEY = 'lw_ui_prefs';
const DEFAULTS = { highContrast: false, reduceMotion: false, theme: 'system' }; // theme: system | light | dark

const load = () => {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return DEFAULTS; }
};

const UiPrefsContext = createContext({ ui: DEFAULTS, setUi: () => {}, resolvedTheme: 'light' });
export const useUiPrefs = () => useContext(UiPrefsContext);

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

// App-wide accessibility switches. They are applied as attributes on <html> so the whole interface
// (not just captions) follows them, and they are remembered in this browser.
export function UiPrefsProvider({ children }) {
  const [ui, setUiState] = useState(load);
  const [dark, setDark] = useState(systemDark);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = (e) => setDark(e.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  const resolvedTheme = ui.theme === 'system' ? (dark ? 'dark' : 'light') : ui.theme;

  useEffect(() => {
    const root = document.documentElement;
    if (ui.highContrast) root.setAttribute('data-contrast', 'high'); else root.removeAttribute('data-contrast');
    if (ui.reduceMotion) root.setAttribute('data-motion', 'reduce'); else root.removeAttribute('data-motion');
    root.setAttribute('data-theme', resolvedTheme);
    root.style.colorScheme = resolvedTheme;
  }, [ui, resolvedTheme]);

  const setUi = useCallback((patch) => {
    setUiState((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ui, setUi, resolvedTheme }), [ui, setUi, resolvedTheme]);
  return <UiPrefsContext.Provider value={value}>{children}</UiPrefsContext.Provider>;
}
