'use client';

// Light / dark switch for the public pages. The choice is kept in this browser as part of the saved EchoSign preferences
// ("lw_ui_prefs", the same record the signed-in screens use) and applied as data-theme on <html>.
// (An inline script in the layout applies it before the first paint, so there is no flash of the wrong theme.)
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const KEY = 'lw_ui_prefs';

export default function ThemeToggle({ className = '' }) {
  const [theme, setTheme] = useState('light');

  useEffect(() => { setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'); }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.style.colorScheme = next;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      localStorage.setItem(KEY, JSON.stringify({ ...saved, theme: next }));
    } catch { /* storage unavailable */ }
  };

  const dark = theme === 'dark';
  return (
    <button type="button" className={`icon-btn theme-toggle ${className}`} aria-pressed={dark} aria-label={dark ? 'Dark mode is on. Switch to light mode' : 'Light mode is on. Switch to dark mode'} onClick={toggle}>
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}
