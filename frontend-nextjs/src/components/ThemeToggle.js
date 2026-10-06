'use client';

// Light / dark switch. The choice is kept in this browser and applied as data-theme on <html>, like the React app.
// (An inline script in the layout applies it before the first paint, so there is no flash of the wrong theme.)
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const KEY = 'lw_theme';

export default function ThemeToggle({ className = '' }) {
  const [theme, setTheme] = useState('light');

  useEffect(() => { setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'); }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.style.colorScheme = next;
    try { localStorage.setItem(KEY, next); } catch { /* storage unavailable */ }
  };

  const dark = theme === 'dark';
  return (
    <button type="button" className={`icon-btn theme-toggle ${className}`} aria-pressed={dark} aria-label={dark ? 'Dark mode is on. Switch to light mode' : 'Light mode is on. Switch to dark mode'} onClick={toggle}>
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}
