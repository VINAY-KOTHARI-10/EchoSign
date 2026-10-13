// Rendering lab: the same time stamp produced four ways, so the strategies can be compared side by side.
import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { getDictionary } from '@/i18n/get-dictionary';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return { title: d.rendering.title, description: d.rendering.subtitle };
}

export default async function RenderingIndex({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  const cards = [
    { key: 'ssg', when: 'build time' },
    { key: 'isr', when: 'build + every 60 s' },
    { key: 'ssr', when: 'every request' },
    { key: 'csr', when: 'in the browser' },
  ];
  return (
    <div className="container section">
      <PageHeader title={d.rendering.title} subtitle={d.rendering.subtitle} />
      <div className="grid grid-2">
        {cards.map((c) => (
          <article key={c.key} className="card">
            <h2 className="card-title">{d.rendering[c.key]}</h2>
            <p className="muted">{d.rendering[`${c.key}Body`]}</p>
            <p className="mono eyebrow" style={{ margin: '12px 0' }}>{c.when}</p>
            <Link href={`/${locale}/rendering/${c.key}`} className="btn btn-outline btn-sm">{d.rendering.open} →</Link>
          </article>
        ))}
      </div>
      <section className="notice" style={{ marginTop: 24 }}>
        <b>{d.rendering.choose}.</b> {d.rendering.chooseBody}
      </section>
    </div>
  );
}
