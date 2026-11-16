import { useEffect, useState } from 'react';
import { FileText, LibraryBig, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';

import * as api from '../api';
import { formatDate } from '../lib';
import Pager from '../components/Pager';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/ui';

// A student's own library: every class they joined, with its notes and quiz, readable after class.
export default function Library() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  const load = () => { setError(''); api.classrooms.attended(page).then((r) => setData(r.data)).catch((e) => { setError(e.message); setData((d) => d); }); };
  useEffect(load, [page]);
  // Quietly fetch the notes of listed lectures so the service worker keeps them for offline reading.
  useEffect(() => {
    if (!data || !online) return;
    data.classes.filter((c) => c.hasNotes).slice(0, 10).forEach((c) => { api.classrooms.getSummary(c.code).catch(() => {}); });
  }, [data, online]);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  return (
    <>
      <PageHeader icon={LibraryBig} title="My lectures" subtitle="Classes you joined, with their notes, quizzes and full transcripts." />
      {!online && <p className="conn-banner" role="status"><WifiOff size={18} aria-hidden="true" /> You are offline. Notes you opened before are still available; live classes and transcripts need a connection.</p>}
      {error && !data ? <div className="card"><ErrorState message={error} onRetry={load} /></div> : !data ? <div className="card"><LoadingState label="Loading your lectures…" /></div> : data.classes.length === 0 ? (
        <div className="card"><EmptyState icon={LibraryBig} title="No lectures yet" action={<Link to="/classroom" className="btn btn-primary btn-sm">Join a class</Link>}>When you join a class with its code, it is saved here so you can come back to the transcript and notes.</EmptyState></div>
      ) : (
        <>
          {error && <p className="error-text" role="alert">Showing saved results. {error}</p>}
          <ul className="lecture-grid plain-grid">
            {data.classes.map((c) => (
              <li key={c.code} className="card lecture-card">
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <h2 style={{ fontSize: 18 }}>{c.title}</h2>
                  {c.active ? <StatusBadge status="live">Live</StatusBadge> : <StatusBadge status="ended">Ended</StatusBadge>}
                </div>
                <p className="muted" style={{ fontSize: 14 }}>{c.teacher} · {formatDate(c.date)}</p>
                <p className="muted" style={{ fontSize: 13 }}>{c.captions} captions · you attended {c.minutesAttended} min</p>
                <div className="pill-group" style={{ margin: '10px 0' }}>
                  {c.hasNotes ? <StatusBadge status="ok">{c.noteCount} notes{c.quizCount ? ` · ${c.quizCount} quiz questions` : ''}</StatusBadge> : <StatusBadge status="off">No notes yet</StatusBadge>}
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <Link to={`/classroom/${c.code}`} className="btn btn-primary btn-sm"><FileText size={15} aria-hidden="true" /> {c.active ? 'Open class' : 'Transcript & Ask'}</Link>
                  {c.hasNotes && <Link to={`/library/${c.code}`} className="btn btn-outline btn-sm">Notes (works offline)</Link>}
                </div>
              </li>
            ))}
          </ul>
          <Pager page={data.pagination.page} totalPages={data.pagination.pages} onChange={setPage} />
        </>
      )}
    </>
  );
}
