// The footer: the same as the React site (logo and copyright). A small row of extra links and the language menu sit
// under it, because this site also has pages the React site does not (sign dictionary, languages, rendering lab).
import Link from 'next/link';
import Logo from '@/components/Logo';
import LocaleSelect from '@/components/LocaleSelect';
import { getLandingCopy } from '@/features/landing/copy';

export default function SiteFooter({ locale = 'en', dict }) {
  const c = getLandingCopy(locale);
  return (
    <footer className="footer">
      <div className="container row between wrap"><Logo href={`/${locale}`} /><span>© {new Date().getFullYear()} EchoSign</span></div>
      <div className="container row between wrap" style={{ marginTop: 14, fontSize: 14 }}>
        <nav aria-label={c.footer.explore} className="row wrap" style={{ gap: 18 }}>
          <Link href={`/${locale}/dictionary`} className="link">{c.footer.signs}</Link>
          <Link href={`/${locale}/languages`} className="link">{c.footer.languages}</Link>
          <Link href={`/${locale}/rendering`} className="link">{c.footer.rendering}</Link>
        </nav>
        <LocaleSelect locale={locale} label={dict.nav.language} />
      </div>
    </footer>
  );
}
