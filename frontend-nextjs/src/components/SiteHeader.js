// The top bar of the public pages: the same navbar as the EchoSign React site. A Server Component (no JavaScript of its
// own; only the theme and language buttons are interactive). It does not read cookies, so these pages stay fully static.
import Link from 'next/link';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import LocaleSelect from '@/components/LocaleSelect';

export default function SiteHeader({ locale, dict }) {
  const links = [
    ['/signs', dict.nav.signs],
    ['/languages', dict.nav.languages],
    ['/rendering', dict.nav.rendering],
  ];
  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <Logo href={`/${locale}`} />
        <nav className="nav-links" aria-label={dict.nav.menu}>
          {links.map(([href, label]) => <Link key={href} href={`/${locale}${href}`}>{label}</Link>)}
        </nav>
        <div className="row">
          <LocaleSelect locale={locale} label={dict.nav.language} />
          <ThemeToggle />
          <Link href={`/${locale}/login`} className="btn btn-ghost btn-sm">{dict.nav.login}</Link>
          <Link href={`/${locale}/register`} className="btn btn-primary btn-sm">{dict.nav.register}</Link>
        </div>
      </div>
    </header>
  );
}
