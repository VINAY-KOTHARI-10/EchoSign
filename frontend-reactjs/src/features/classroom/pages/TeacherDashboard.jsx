import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpenCheck, CalendarCheck, Captions, Clock, Presentation, Sparkles, Users } from 'lucide-react';
import * as api from '../../../api';
import { formatDate } from '../../../lib';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../../../components/ui';

const SOURCES = [['SPEECH', 'Speech'], ['SIGN', 'Sign'], ['TEXT', 'Typed']];

// Teacher analytics built only from real records (classes, captions, attendance). Nothing here is estimated about
// students' ability or hearing, only counts of what happened in the teacher's own classes.
export default function TeacherDashboard() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const load = () => { setError(''); api.classrooms.stats().then((r) => setS(r.data)).catch((e) => setError(e.message)); };
  useEffect(load, []);

  if (error) return <><PageHeader icon={Presentation} title="Teacher dashboard" /><div className="card"><ErrorState message={error} onRetry={load} /></div></>;
  if (!s) return <><PageHeader icon={Presentation} title="Teacher dashboard" /><div className="card"><LoadingState label="Loading your classes…" /></div></>;

  const t = s.totals;
  const hours = t.lectureMinutes >= 60 ? `${Math.floor(t.lectureMinutes / 60)} h ${t.lectureMinutes % 60} min` : `${t.lectureMinutes} min`;
  const cards = [
    { icon: BookOpenCheck, label: 'Classes', value: t.classrooms, bg: 'var(--violet-light)', color: 'var(--violet-dark)' },
    { icon: CalendarCheck, label: 'Completed', value: t.completed, bg: 'var(--mint)', color: 'var(--go)' },
    { icon: Captions, label: 'Live now', value: t.active, bg: 'var(--peach)', color: '#9a3412' },
    { icon: Users, label: 'Attendance', value: t.attendance, bg: 'var(--violet-light)', color: 'var(--violet-dark)', hint: 'students across all classes' },
    { icon: Captions, label: 'Captions', value: t.captions, bg: 'var(--mint)', color: 'var(--go)' },
    { icon: Clock, label: 'Lecture time', value: hours, bg: '#fef3c7', color: '#8a4a05', hint: 'completed classes' },
    { icon: Sparkles, label: 'Saved summaries', value: t.summaries, bg: 'var(--peach)', color: '#9a3412' },
  ];
  const totalCaptions = SOURCES.reduce((n, [k]) => n + (s.bySource[k] || 0), 0);

  return (
    <>
      <PageHeader icon={Presentation} title="Teacher dashboard" subtitle="Your classes, attendance and captions."
        actions={<Link to="/classroom" className="btn btn-primary">Start or open a class</Link>} />

      {t.classrooms === 0 ? (
        <div className="card"><EmptyState icon={Presentation} title="No classes yet">Start a class from the Classroom page. Attendance, captions and notes will appear here.</EmptyState></div>
      ) : (
        <>
          <ul className="grid-stats plain-grid" style={{ marginBottom: 'var(--gap)' }} aria-label="Key numbers">
            {cards.map(({ icon: Icon, label, value, bg, color, hint }) => (
              <li className="card stat" key={label}>
                <div className="num">{value}</div><div className="label">{label}</div>{hint && <div className="muted" style={{ fontSize: 12 }}>{hint}</div>}
              </li>
            ))}
          </ul>

          <div className="grid grid-2" style={{ alignItems: 'start', marginBottom: 'var(--gap)' }}>
            <section className="card" aria-labelledby="src-h">
              <h2 id="src-h" className="card-title">How captions were made</h2>
              {totalCaptions === 0 ? <EmptyState icon={Captions} title="No captions yet" /> : (
                <ul className="bar-list">
                  {SOURCES.map(([k, label]) => (
                    <li key={k}>
                      <div className="row between" style={{ fontSize: 14, fontWeight: 700 }}><span>{label}</span><span>{s.bySource[k] || 0} ({Math.round(((s.bySource[k] || 0) / totalCaptions) * 100)}%)</span></div>
                      <div className="bar" aria-hidden="true"><i style={{ width: `${((s.bySource[k] || 0) / totalCaptions) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card" aria-labelledby="top-h">
              <h2 id="top-h" className="card-title">Topics you highlight most</h2>
              <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>From the keywords you set on your classes.</p>
              {s.topics.length === 0 ? <EmptyState icon={Sparkles} title="No keywords yet">Add keywords in a class’s Settings to see them here.</EmptyState> : (
                <div className="pill-group">{s.topics.map((x) => <span key={x.topic} className="chip">{x.topic} · {x.classes}</span>)}</div>
              )}
            </section>
          </div>

          <section className="card" aria-labelledby="rec-h">
            <h2 id="rec-h" className="card-title">Recent classes</h2>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Your most recent classes</caption>
                <thead><tr><th scope="col">Class</th><th scope="col">Status</th><th scope="col">Date</th><th scope="col">Students</th><th scope="col">Captions</th><th scope="col">Length</th><th scope="col">Notes</th></tr></thead>
                <tbody>
                  {s.recent.map((r) => (
                    <tr key={r.code}>
                      <th scope="row" style={{ textAlign: 'left' }}><Link to={`/classroom/${r.code}`} className="link">{r.title}</Link><div className="muted mono" style={{ fontSize: 12 }}>{r.code}</div></th>
                      <td>{r.active ? <StatusBadge status="live">Live</StatusBadge> : <StatusBadge status="ended">Ended</StatusBadge>}</td>
                      <td>{formatDate(r.createdAt)}</td><td>{r.attendees}</td><td>{r.captions}</td>
                      <td>{r.minutes === null ? '—' : `${r.minutes} min`}</td>
                      <td>{r.hasNotes ? <StatusBadge status="ok">Saved</StatusBadge> : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
