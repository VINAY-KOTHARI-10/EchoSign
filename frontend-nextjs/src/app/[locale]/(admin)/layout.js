// The admin area: only accounts with the Admin role get in (role-based access control, checked on the server).
import { AdminFrame } from '@/react-app/ClientApp';
import { requireRole } from '@/lib/session';

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children, params }) {
  const { locale } = await params;
  await requireRole(locale, ['ADMIN'], `/${locale}/admin`);
  return <AdminFrame>{children}</AdminFrame>;
}
