'use client';

// The notes screen: the create form and the list. OPTIMISTIC UI (useOptimistic): when you add, pin or delete a note, the list
// changes immediately; the Server Action then does the real work, and the list is replaced by the server's answer.
// If the action fails, the optimistic change disappears by itself.
import { useOptimistic, useTransition } from 'react';
import Link from 'next/link';
import { EmptyState } from '@/components/ui';
import NoteForm from '@/features/notes/NoteForm';
import { deleteNoteAction, togglePinAction } from '@/features/notes/actions';

function reducer(notes, change) {
  switch (change.type) {
    case 'add': return [change.note, ...notes];
    case 'delete': return notes.filter((n) => n.id !== change.id);
    case 'pin': return notes.map((n) => (n.id === change.id ? { ...n, pinned: !n.pinned } : n));
    default: return notes;
  }
}

export default function NotesBoard({ notes, locale, dict }) {
  const [optimisticNotes, change] = useOptimistic(notes, reducer);
  const [, startTransition] = useTransition();

  const remove = (id) => {
    if (!window.confirm(dict.notes.confirmDelete)) return;
    startTransition(async () => { change({ type: 'delete', id }); await deleteNoteAction(locale, id); });
  };
  const pin = (id) => startTransition(async () => { change({ type: 'pin', id }); await togglePinAction(locale, id); });

  return (
    <>
      <section aria-labelledby="new-h" style={{ marginBottom: 24 }}>
        <h2 id="new-h" className="card-title" style={{ marginBottom: 10 }}>{dict.notes.newNote}</h2>
        <NoteForm locale={locale} dict={dict} onOptimistic={(note) => change({ type: 'add', note })} />
      </section>

      {optimisticNotes.length === 0 ? (
        <div className="card"><EmptyState title={dict.notes.title}>{dict.notes.empty}</EmptyState></div>
      ) : (
        <ul className="lecture-grid plain-grid">
          {optimisticNotes.map((n) => (
            <li key={n.id} className={`card lecture-card note-card ${n.pinned ? 'pinned' : ''} ${n.pending ? 'pending' : ''}`}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <h3 style={{ fontSize: 18 }}>{n.pinned && <span aria-hidden="true">📌 </span>}{n.title}</h3>
                {n.classCode && <span className="badge badge-info mono">{n.classCode}</span>}
              </div>
              {n.body && <p className="muted" style={{ whiteSpace: 'pre-line', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.body}</p>}
              {n.tags?.length > 0 && <ul className="tag-list">{n.tags.map((t) => <li key={t} className="tag">#{t}</li>)}</ul>}
              <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
                {!n.pending && <Link href={`/${locale}/notes/${n.id}`} className="btn btn-primary btn-sm">{dict.notes.edit}</Link>}
                <button type="button" className="btn btn-outline btn-sm" disabled={n.pending} onClick={() => pin(n.id)}>{n.pinned ? dict.notes.unpin : dict.notes.pin}</button>
                <button type="button" className="btn btn-danger-soft btn-sm" disabled={n.pending} onClick={() => remove(n.id)}>{dict.notes.delete}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
