// Study notes: SSR with search and paging in the address (?q=, ?tag=, ?page=). The list is read with Prisma on the server
// and handed to a Client Component that adds the optimistic behaviour.
import Link from 'next/link';
import { Search } from 'lucide-react';
import { ErrorState, PageHeader } from '@/components/ui';
import NotesBoard from '@/features/notes/NotesBoard';
import { listNotes } from '@/features/notes/data';
import { getDictionary } from '@/i18n/get-dictionary';
import { requireSession } from '@/lib/session';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return { title: d.notes.title };
}

// Prisma returns Date objects; Client Components can only receive plain values, so dates become strings.
const plain = (n) => ({ ...n, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() });

export default async function NotesPage({ params, searchParams }) {
  const { locale } = await params;
  const { q = '', tag = '', page: pageParam } = await searchParams;
  const d = await getDictionary(locale);
  const { user } = await requireSession(locale, `/${locale}/notes`);

  let result = null;
  let failed = false;
  try {
    result = await listNotes({ userId: user.id, q: String(q).slice(0, 80), tag: String(tag).slice(0, 20), page: parseInt(pageParam || '1', 10) || 1 });
  } catch (err) {
    console.error('notes list failed', err?.message);
    failed = true;
  }

  const buildHref = (page) => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (tag) sp.set('tag', tag);
    if (page > 1) sp.set('page', String(page));
    const s = sp.toString();
    return `/${locale}/notes${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <PageHeader title={d.notes.title} subtitle={d.notes.subtitle} />

      {/* A plain GET form: it puts the search into the address, so results can be bookmarked and shared. */}
      <form method="GET" role="search" className="row" style={{ gap: 8, marginBottom: 20, maxWidth: 520 }}>
        <input type="search" name="q" defaultValue={q} placeholder={d.notes.search} aria-label={d.notes.search} className="input" />
        {tag && <input type="hidden" name="tag" value={tag} />}
        <button className="btn btn-primary btn-icon" aria-label={d.notes.search}><Search size={18} aria-hidden="true" /></button>
      </form>
      {tag && <p className="muted" style={{ marginBottom: 16 }}>#{tag} · <Link href={`/${locale}/notes`} className="link">{d.notes.allTags}</Link></p>}

      {failed ? (
        <div className="card"><ErrorState title={d.common.somethingWrong} message={d.common.somethingWrongBody} /></div>
      ) : (
        <>
          <NotesBoard notes={result.items.map(plain)} locale={locale} dict={d} />
          {result.pages > 1 && (
            <nav aria-label="Pagination" className="pager">
              {result.page > 1 ? <Link href={buildHref(result.page - 1)} className="btn btn-outline btn-sm">← {d.common.previous}</Link> : <span />}
              <span className="muted" style={{ fontSize: 14 }}>{d.common.page} {result.page} {d.common.of} {result.pages}</span>
              {result.page < result.pages ? <Link href={buildHref(result.page + 1)} className="btn btn-outline btn-sm">{d.common.next} →</Link> : <span />}
            </nav>
          )}
        </>
      )}
    </>
  );
}
