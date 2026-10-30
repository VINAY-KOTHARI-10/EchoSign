import { PageHeader, StatusBadge } from '@/components/ui';
import { getDictionary } from '@/i18n/get-dictionary';
import { requireSession } from '@/lib/session';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return { title: d.dashboard.title };
}

export default async function DashboardPage({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  const { user } = await requireSession(locale, `/${locale}/dashboard`);
  return (
    <PageHeader
      title={`${d.dashboard.welcome}, ${user.username}`}
      subtitle={d.dashboard.stats}
      actions={<StatusBadge status="info">{d.dashboard.role}: {user.role}</StatusBadge>}
    />
  );
}
