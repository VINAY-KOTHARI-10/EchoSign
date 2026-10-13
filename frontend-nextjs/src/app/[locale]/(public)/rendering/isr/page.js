// ISR: Incremental Static Regeneration. Served as a static page, and re-rendered in the background when a visit arrives
// more than 60 seconds after the last build of it. The visitor who triggers it still gets the old copy; the next one gets the new.
import TimeCard, { formatTime } from '@/components/TimeCard';
import { getDictionary } from '@/i18n/get-dictionary';

export const revalidate = 60;

export default async function IsrPage({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return <TimeCard title={d.rendering.isr} body={d.rendering.isrBody} label={d.rendering.time} time={formatTime(Date.now())} note="export const revalidate = 60" />;
}
