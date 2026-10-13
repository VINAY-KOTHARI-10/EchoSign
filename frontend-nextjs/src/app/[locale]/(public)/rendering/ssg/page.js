// SSG: Static Site Generation. This page has no request-time data, so Next.js renders it once at build time.
// `generateStaticParams` in the layout supplies the languages. In `next dev` pages always render on demand.
import TimeCard, { formatTime } from '@/components/TimeCard';
import { getDictionary } from '@/i18n/get-dictionary';

const RENDERED_AT = formatTime(Date.now()); // evaluated once, when the site is built

export default async function SsgPage({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return <TimeCard title={d.rendering.ssg} body={d.rendering.ssgBody} label={d.rendering.time} time={RENDERED_AT} note="export: static (default)" />;
}
