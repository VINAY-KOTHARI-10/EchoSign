// Sign dictionary index. ISR: built ahead of time, and refreshed in the background at most once a day.
import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { getDictionary } from '@/i18n/get-dictionary';
import { LETTER_KEYS, signStatus } from '@/features/signs/data';

export const revalidate = 86400;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return { title: d.signs.title, description: d.signs.subtitle };
}

const BADGE = { reliable: 'badge-ok', shaky: 'badge-warn', motion: 'badge-warn' };

export default async function SignsPage({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return (
    <div className="container section">
      <PageHeader title={d.signs.title} subtitle={d.signs.subtitle} />
      <ul className="sign-grid" aria-label="ASL alphabet">
        {LETTER_KEYS.map((letter) => {
          const status = signStatus(letter);
          return (
            <li key={letter}>
              <Link href={`/${locale}/dictionary/${letter.toLowerCase()}`} className="sign-card" aria-label={`${letter}. ${d.signs[status]}`}>
                <b className="big-letter" style={{ fontSize: 40 }}>{letter}</b>
                <span className={`badge ${BADGE[status]}`}>{d.signs[status]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="muted" style={{ marginTop: 24, maxWidth: 640, fontSize: 14 }}>{d.signs.note}</p>
    </div>
  );
}
