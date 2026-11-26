// The lecture library: SSR. Rendered on the server for the signed-in person on every visit (it reads their cookies).
// The backend call is made here, on the server, with the person's access token.
// Markup and classes match the "My lectures" page of the EchoSign React app.
import Link from 'next/link';
import { FileText, LibraryBig } from 'lucide-react';
import { EmptyState, ErrorState, PageHeader, StatusBadge } from '@/components/ui';
import { getAttended } from '@/features/library/data';
import { getDictionary } from '@/i18n/get-dictionary';
import { requireSession } from '@/lib/session';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return { title: d.library.title };
}

export default async function LibraryPage({ params, searchParams }) {
  const { locale } = await params;
  const { page: pageParam } = await searchParams; // ?page=2
  const page = Math.max(1, parseInt(pageParam || '1', 10) || 1);
  const d = await getDictionary(locale);
  const { token } = await requireSession(locale, `/${locale}/lectures`);
  const data = await getAttended(token, page);
  const { pages } = data.pagination;

  return (
    <>
      <PageHeader title={d.library.title} subtitle={d.library.subtitle} />

      {!data.ok ? (
        <div className="card"><ErrorState title={d.common.somethingWrong} message={data.status === 0 ? d.common.backendDown : data.error} /></div>
      ) : data.classes.length === 0 ? (
        <div className="card"><EmptyState title={d.library.title}>{d.library.empty}</EmptyState></div>
      ) : (
        <>
          <ul className="lecture-grid plain-grid">
            {data.classes.map((c) => (
              <li key={c.code} className="card lecture-card">
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <h2 style={{ fontSize: 18 }}>{c.title}</h2>
                  {c.active ? <StatusBadge status="live">{d.library.live}</StatusBadge> : <StatusBadge status="ended">{d.library.ended}</StatusBadge>}
                </div>
                <p className="muted" style={{ fontSize: 14 }}>{c.teacher}</p>
                <p className="muted" style={{ fontSize: 13 }}>{c.captions} {d.library.captions} · {d.library.attended} {c.minutesAttended} {d.library.minutes}</p>
                <div className="pill-group" style={{ margin: '10px 0' }}>
                  {c.hasNotes ? <StatusBadge status="ok">{c.noteCount} notes</StatusBadge> : <StatusBadge status="off">{d.library.noNotes}</StatusBadge>}
                </div>
                {c.hasNotes && <Link href={`/${locale}/lectures/${c.code}`} className="btn btn-primary btn-sm"><FileText size={15} aria-hidden="true" /> {d.library.notes}</Link>}
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Pagination" className="pager">
              {page > 1 ? <Link href={`/${locale}/lectures?page=${page - 1}`} className="btn btn-outline btn-sm">← {d.common.previous}</Link> : <span />}
              <span className="muted" style={{ fontSize: 14 }}>{d.common.page} {page} {d.common.of} {pages}</span>
              {page < pages ? <Link href={`/${locale}/lectures?page=${page + 1}`} className="btn btn-outline btn-sm">{d.common.next} →</Link> : <span />}
            </nav>
          )}
        </>
      )}
    </>
  );
}
