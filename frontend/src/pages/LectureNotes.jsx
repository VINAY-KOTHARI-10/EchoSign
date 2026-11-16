import { useEffect, useState } from 'react';
import { ArrowLeft, WifiOff } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import * as api from '../api';
import SummaryPanel from '../components/classroom/SummaryPanel';
import useOnline from '../hooks/useOnline';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';

// Saved notes, key terms and quiz for one lecture. This page is kept by the service worker once opened, so it can be
// read offline (the transcript and live captions cannot).
export default function LectureNotes() {
  const { code } = useParams();
  const online = useOnline();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => { setError(''); api.classrooms.getSummary(code).then((r) => setData(r.data)).catch((e) => setError(e.message)); };
  useEffect(load, [code]);

  const room = data ? { ...data.classroom, code, summary: data.summary } : null;
  return (
    <>
      <Link to="/library" className="btn btn-ghost btn-sm back-link"><ArrowLeft size={16} aria-hidden="true" /> My lectures</Link>
      <PageHeader title={room?.title || 'Lecture notes'} subtitle={room ? `${room.teacher || ''} · class code ${code}` : ''} />
      {!online && <p className="conn-banner" role="status"><WifiOff size={18} aria-hidden="true" /> You are offline. Showing the notes saved on this device.</p>}
      {error ? <div className="card"><ErrorState message={online ? error : 'These notes are not saved on this device yet. Open them once while online.'} onRetry={load} /></div>
        : !data ? <div className="card"><LoadingState label="Loading notes…" /></div>
        : !data.summary ? <div className="card"><EmptyState title="No notes yet">Your teacher has not generated notes for this lecture.</EmptyState></div>
        : <SummaryPanel room={room} setRoom={() => {}} canModerate={false} captionCount={data.captionCount} />}
    </>
  );
}
