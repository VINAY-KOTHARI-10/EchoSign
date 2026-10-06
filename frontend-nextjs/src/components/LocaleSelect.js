'use client';

// A compact language menu for the navbar (a <select>, so it never wraps or crowds the bar).
import { usePathname, useRouter } from 'next/navigation';
import { localeNames, locales } from '@/i18n/config';

export default function LocaleSelect({ locale, label }) {
  const pathname = usePathname() || `/${locale}`;
  const router = useRouter();
  const rest = pathname.split('/').slice(2).join('/');

  const change = (e) => {
    const code = e.target.value;
    document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=31536000; samesite=lax`;
    router.push(`/${code}${rest ? `/${rest}` : ''}`);
  };

  return (
    <select className="select locale-select" value={locale} onChange={change} aria-label={label}>
      {locales.map((code) => <option key={code} value={code} lang={code}>{localeNames[code]}</option>)}
    </select>
  );
}
