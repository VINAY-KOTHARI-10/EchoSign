'use client';

// Language switcher (a Client Component, because it reads the current address and reacts to clicks).
// It keeps the rest of the address and only changes the language part: /en/library -> /hi/library.
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { localeNames, locales } from '@/i18n/config';

export default function LocaleSwitcher({ locale, label }) {
  const pathname = usePathname() || `/${locale}`;
  const rest = pathname.split('/').slice(2).join('/');
  const remember = (code) => { document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=31536000; samesite=lax`; };

  return (
    <nav aria-label={label} className="locale-switch pill-group">
      {locales.map((code) => (
        <Link
          key={code}
          href={`/${code}${rest ? `/${rest}` : ''}`}
          hrefLang={code}
          lang={code}
          onClick={() => remember(code)}
          aria-current={code === locale ? 'true' : undefined}
          className={`pill ${code === locale ? 'on' : ''}`}
        >
          {localeNames[code]}
        </Link>
      ))}
    </nav>
  );
}
