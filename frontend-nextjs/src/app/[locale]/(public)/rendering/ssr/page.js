// SSR: Server-Side Rendering. `force-dynamic` turns caching off: the page is rendered on the server for every request.
import TimeCard, { formatTime } from '@/components/TimeCard';
import { getDictionary } from '@/i18n/get-dictionary';

export const dynamic = 'force-dynamic';

export default async function SsrPage({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return <TimeCard title={d.rendering.ssr} body={d.rendering.ssrBody} label={d.rendering.time} time={formatTime(Date.now())} note="export const dynamic = 'force-dynamic'" />;
}
