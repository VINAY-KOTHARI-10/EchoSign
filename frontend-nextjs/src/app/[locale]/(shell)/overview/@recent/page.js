// Slot 2: recent activity: the latest study notes (this site's database) and the latest lectures (the EchoSign backend).
import Link from 'next/link';
import { getAttended } from '@/features/library/data';
import { recentNotes } from '@/features/notes/data';
import { getDictionary } from '@/i18n/get-dictionary';
import { requireSession } from '@/lib/session';

export default async function RecentSlot({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  const { user, token } = await requireSession(locale, `/${locale}/overview`);
  const [notes, lectures] = await Promise.all([recentNotes(user.id, 4), getAttended(token, 1)]);

  return (
    <section aria-labelledby="recent-h" className="card">
      <h2 id="recent-h" className="card-title">{d.dashboard.recent}</h2>
      <div className="grid grid-2">
        <div>
          <div className="eyebrow">{d.dashboard.recentNotes}</div>
          {notes.length === 0 ? <p className="muted">{d.dashboard.none}</p> : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
              {notes.map((n) => <li key={n.id}><Link href={`/${locale}/notes/${n.id}`} className="link">{n.title}</Link></li>)}
            </ul>
          )}
        </div>
        <div>
          <div className="eyebrow">{d.dashboard.recentLectures}</div>
          {!lectures.ok || lectures.classes.length === 0 ? <p className="muted">{lectures.ok ? d.dashboard.none : d.common.backendDown}</p> : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
              {lectures.classes.slice(0, 4).map((c) => (
                <li key={c.code}>{c.hasNotes ? <Link href={`/${locale}/lectures/${c.code}`} className="link">{c.title}</Link> : <b>{c.title}</b>}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
