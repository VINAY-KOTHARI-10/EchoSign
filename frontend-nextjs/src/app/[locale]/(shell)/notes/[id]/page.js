// One note: read and edit (dynamic route). A note that does not exist, or belongs to someone else, is a 404.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import NoteForm from '@/features/notes/NoteForm';
import { getNote } from '@/features/notes/data';
import { getDictionary } from '@/i18n/get-dictionary';
import { isAdmin, requireSession } from '@/lib/session';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return { title: d.notes.edit };
}

export default async function NotePage({ params }) {
  const { locale, id } = await params;
  const d = await getDictionary(locale);
  const { user } = await requireSession(locale, `/${locale}/notes/${id}`);
  const note = await getNote(user.id, id, { all: isAdmin(user) });
  if (!note) notFound();
  const editable = note.userId === user.id; // an admin can read everyone's notes but only edit their own

  return (
    <>
      <Link href={`/${locale}/notes`} className="btn btn-ghost btn-sm back-link"><ArrowLeft size={16} aria-hidden="true" /> {d.notes.title}</Link>
      <PageHeader title={note.title} subtitle={`${d.notes.updated}: ${note.updatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`} />
      <div className="page-narrow">
        {editable
          ? <NoteForm locale={locale} dict={d} note={{ id: note.id, title: note.title, body: note.body, classCode: note.classCode, tags: note.tags, pinned: note.pinned }} />
          : <article className="card" style={{ whiteSpace: 'pre-line' }}>{note.body}</article>}
      </div>
    </>
  );
}
