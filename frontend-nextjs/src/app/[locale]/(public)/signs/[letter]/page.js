// One page per letter. SSG with dynamic routes: generateStaticParams lists the 26 letters, so all 26 pages
// (times 3 languages) are built ahead of time. Any other address is a 404.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { StatusBadge } from '@/components/ui';
import { getDictionary } from '@/i18n/get-dictionary';
import { LETTERS, LETTER_KEYS, signStatus } from '@/features/signs/data';
import { locales } from '@/i18n/config';

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((locale) => LETTER_KEYS.map((letter) => ({ locale, letter: letter.toLowerCase() })));
}

export async function generateMetadata({ params }) {
  const { locale, letter } = await params;
  const key = String(letter).toUpperCase();
  if (!LETTERS[key]) return {};
  const d = await getDictionary(locale);
  return { title: `${d.signs.title}: ${key}`, description: LETTERS[key].hint };
}

export default async function LetterPage({ params }) {
  const { locale, letter } = await params;
  const key = String(letter).toUpperCase();
  if (!LETTERS[key]) notFound();
  const d = await getDictionary(locale);
  const index = LETTER_KEYS.indexOf(key);
  const prev = LETTER_KEYS[index - 1];
  const next = LETTER_KEYS[index + 1];
  const status = signStatus(key);

  return (
    <div className="container section">
      <Link href={`/${locale}/signs`} className="btn btn-ghost btn-sm back-link"><ArrowLeft size={16} aria-hidden="true" /> {d.signs.back}</Link>
      <article className="card" style={{ marginTop: 16 }}>
        <div className="letter-layout">
          <div className="letter-big" aria-hidden="true">{key}</div>
          <div>
            <h1>{d.signs.title}: {key}</h1>
            <p style={{ margin: '12px 0 20px' }}><StatusBadge status={status === 'reliable' ? 'ok' : 'warn'}>{d.signs[status]}</StatusBadge></p>
            <div className="eyebrow">{d.signs.howTo}</div>
            <p style={{ fontSize: 20, lineHeight: 1.5, marginTop: 6 }}>{LETTERS[key].hint}</p>
          </div>
        </div>
      </article>
      <nav aria-label="Letters" className="row between" style={{ marginTop: 20 }}>
        {prev ? <Link href={`/${locale}/signs/${prev.toLowerCase()}`} className="btn btn-outline btn-sm">← {prev}</Link> : <span />}
        {next ? <Link href={`/${locale}/signs/${next.toLowerCase()}`} className="btn btn-outline btn-sm">{next} →</Link> : <span />}
      </nav>
    </div>
  );
}
