// The languages EchoSign supports, read from the backend's /languages address.
// Server Component data fetching with caching and revalidation: the answer is kept for an hour (revalidate: 3600),
// tagged "languages" so the /api/revalidate address can refresh it on demand when an admin changes the list.
import { PageHeader } from '@/components/ui';
import { backendJson } from '@/lib/backend';
import { getDictionary } from '@/i18n/get-dictionary';

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return { title: d.languages.title, description: d.languages.subtitle };
}

// Shown when the backend cannot be reached (also during a build), so the page never fails.
const FALLBACK = [
  { code: 'en', name: 'English' }, { code: 'es', name: 'Spanish' }, { code: 'fr', name: 'French' }, { code: 'de', name: 'German' },
  { code: 'hi', name: 'Hindi' }, { code: 'ja', name: 'Japanese' }, { code: 'zh', name: 'Mandarin Chinese' }, { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' }, { code: 'ko', name: 'Korean' }, { code: 'ar', name: 'Arabic' }, { code: 'ru', name: 'Russian' },
];

export default async function LanguagesPage({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  const result = await backendJson('/languages', { next: { revalidate: 3600, tags: ['languages'] } });
  const live = result.ok && Array.isArray(result.data?.languages) && result.data.languages.length > 0;
  const languages = live ? result.data.languages : FALLBACK;

  return (
    <div className="container section">
      <PageHeader title={d.languages.title} subtitle={d.languages.subtitle} />
      {!live && <p className="notice" role="status" style={{ marginBottom: 20 }}>{d.languages.fallback}</p>}
      <ul className="language-grid">
        {languages.map((l) => (
          <li key={l.code} className="card">
            <span aria-hidden="true" style={{ fontSize: 24 }}>{l.flag || '🌐'}</span>
            <span>
              <b style={{ display: 'block' }}>{l.name}</b>
              <span className="mono muted" style={{ fontSize: 12, textTransform: 'uppercase' }}>{l.code}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="muted" style={{ marginTop: 20, fontSize: 14 }}>{d.languages.refreshed}</p>
    </div>
  );
}
