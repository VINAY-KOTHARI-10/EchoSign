// Layout for every signed-in page. `modal` is a parallel route slot (see @modal): a second page that can be shown on top.
// Note: a layout is not re-rendered on every navigation, so each page ALSO checks the session itself (requireSession).
import AppShell from '@/components/AppShell';
import { getDictionary } from '@/i18n/get-dictionary';
import { requireSession } from '@/lib/session';

export const metadata = { robots: { index: false, follow: false } }; // private pages are kept out of search engines

export default async function AppLayout({ children, modal, params }) {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  const { user } = await requireSession(locale);
  const nav = [
    { key: 'dashboard', label: dict.nav.dashboard },
    { key: 'library', label: dict.nav.library },
    { key: 'notes', label: dict.nav.notes },
    ...(user.role === 'ADMIN' ? [{ key: 'admin', label: dict.nav.admin }] : []),
  ];
  return (
    <>
      <AppShell locale={locale} user={{ username: user.username, role: user.role }} nav={nav} labels={{ language: dict.nav.language, logout: dict.nav.logout }}>
        {children}
      </AppShell>
      {modal}
    </>
  );
}
