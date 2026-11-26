// The top bar of the public pages: the same navbar as the EchoSign React site (Features, How it works, Platform,
// theme switch, Log in, Get started). A Server Component; it does not read cookies, so these pages stay fully static.
import Link from 'next/link';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import { getLandingCopy } from '@/features/landing/copy';

export default function SiteHeader({ locale }) {
  const c = getLandingCopy(locale);
  const home = `/${locale}`;
  return (
    <>
      <a className="skip-link" href="#content">{c.skip}</a>
      <header className="navbar">
        <div className="container navbar-inner">
          <Logo href={home} />
          <nav className="nav-links" aria-label={c.nav.sections}>
            <Link href={`${home}#features`}>{c.nav.features}</Link>
            <Link href={`${home}#how`}>{c.nav.how}</Link>
            <Link href={`${home}#platform`}>{c.nav.platform}</Link>
          </nav>
          <div className="row">
            <ThemeToggle />
            <Link href={`${home}/login`} className="btn btn-ghost btn-sm">{c.nav.login}</Link>
            <Link href={`${home}/register`} className="btn btn-primary btn-sm">{c.nav.start}</Link>
          </div>
        </div>
      </header>
    </>
  );
}
