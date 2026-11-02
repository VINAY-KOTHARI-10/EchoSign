import { Moon, Sun } from 'lucide-react';
import { useUiPrefs } from '../hooks/useUiPrefs';

// Switches between light and dark. The first choice follows the system; after a click it is remembered.
export default function ThemeToggle({ className = '' }) {
  const { setUi, resolvedTheme } = useUiPrefs();
  const dark = resolvedTheme === 'dark';
  return (
    <button type="button" className={`icon-btn theme-toggle ${className}`} aria-pressed={dark} aria-label={dark ? 'Dark mode is on. Switch to light mode' : 'Light mode is on. Switch to dark mode'}
      onClick={() => setUi({ theme: dark ? 'light' : 'dark' })}>
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}
