import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Bot, Captions, DoorOpen, GraduationCap, Hand, Plus, Search, TrendingUp } from 'lucide-react';
import * as api from '../api';
import { LANGS, formatDate } from '../lib';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '../components/ui';

const FILTERS = [['all', 'All'], ['live', 'Live'], ['ended', 'Ended']];

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const QUICK = [
  { to: '/classroom#start', icon: Captions, title: 'Live Captions', sub: 'Speech → Text', tone: '' },
  { to: '/signs', icon: Hand, title: 'Sign Recognition', sub: 'Gesture → Text', tone: 'mint' },
  { to: '/conversation', icon: Bot, title: 'AI Assistant', sub: 'Practise & summarise', tone: 'peach' },
  { to: '/progress', icon: TrendingUp, title: 'Progress', sub: 'Track & improve', tone: 'blue' },
];

export default function ClassroomHub() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, isTeacher } = useAuth(); // teachers and admins start classes; members join them
  const [rooms, setRooms] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ title: '', language: 'en', scheduledAt: '' });
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const titleRef = useRef(null);
  const codeRef = useRef(null);

  const load = useCallback(() => {
    setLoadError('');
    api.classrooms.mine().then((r) => setRooms(r.data.classrooms)).catch((e) => { setLoadError(e.message); setRooms([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.classrooms.create({ ...form, scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined });
      navigate(`/classroom/${res.data.classroom.code}`);
    } catch (err) { toast(err.message, 'error'); setBusy(false); }
  };

  const reopen = async (r) => {
    try { await api.classrooms.reopen(r.code); navigate(`/classroom/${r.code}`); }
    catch (err) { toast(err.message, 'error'); }
  };

  const join = async (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) return setJoinError('Enter the class code your teacher shared (4–6 characters).');
    setJoinError('');
    try {
      await api.classrooms.get(code);
      navigate(`/classroom/${code}`);
    } catch (err) { setJoinError(err.status === 404 ? 'No class found with that code. Check it and try again.' : err.message); }
  };

  const goToForm = () => {
    document.getElementById(isTeacher ? 'start-h' : 'join-h')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (isTeacher ? titleRef : codeRef).current?.focus({ preventScroll: true });
  };

  const shown = useMemo(() => (rooms || []).filter((r) => {
    if (filter === 'live' && !r.active) return false;
    if (filter === 'ended' && r.active) return false;
    const q = query.trim().toLowerCase();
    return !q || r.title.toLowerCase().includes(q) || r.code.toLowerCase().includes(q);
  }), [rooms, filter, query]);

  return (
    <>
      <header className="greet">
        <div>
          <h1>{greeting()}, {user.username} <span aria-hidden="true">👋</span></h1>
          <p>{isTeacher ? 'Make your classroom inclusive for everyone.' : 'Join a class with the code your teacher shared.'}</p>
        </div>
        {isTeacher && <button className="btn btn-primary btn-lg" onClick={goToForm}><Plus size={18} aria-hidden="true" /> New Class</button>}
      </header>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="hero-banner" aria-label="Welcome">
        <div>
          <h2>Speech &amp; Sign<br />to Real-Time Captions</h2>
          <p>Convert speech and sign language into live text captions for an inclusive classroom.</p>
          <div className="actions">
            <button className="btn btn-light btn-lg" onClick={goToForm}>{isTeacher ? 'Start a Class' : 'Join a Class'} <ArrowRight size={18} aria-hidden="true" /></button>
            <Link to="/signs" className="btn btn-glass btn-lg">Learn More</Link>
          </div>
        </div>
        <figure className="hero-mock" style={{ margin: 0 }}>
          <div className="mock-top"><span>Live Caption</span><span>EN</span></div>
          <div className="mock-body" aria-hidden="true">An object in motion stays in motion unless acted upon by an external force.</div>
          <small>Illustration with sample text.</small>
        </figure>
      </section>

      <ul className="quick-tiles" aria-label="Shortcuts">
        {QUICK.map(({ to, icon: Icon, title, sub, tone }) => (
          <li key={title}>
            <Link to={to} className={`quick-tile ${tone}`} onClick={to.endsWith('#start') ? (e) => { e.preventDefault(); goToForm(); } : undefined}>
              <span className="qi" aria-hidden="true"><Icon size={22} /></span>
              <b>{title}</b><span>{sub}</span>
            </Link>
          </li>
        ))}
      </ul>

      {/* ── Start / join ───────────────────────────────────── */}
      {!isTeacher && (
        <p className="notice" style={{ margin: 'var(--gap) 0 0' }}>You’re signed in as a <b>Member</b>. Members join classes with a code. Teachers start them — ask an administrator to give your account the Teacher role.</p>
      )}
      <div className={`grid ${isTeacher ? 'grid-2' : 'grid-1'} role-cards`} style={{ marginTop: 'var(--gap)' }}>
        {isTeacher && (
          <form className="card role-card" onSubmit={create} aria-labelledby="start-h">
            <div className="role-icon" aria-hidden="true"><GraduationCap size={28} /></div>
            <h2 id="start-h">Start a class <span className="muted role-tag">Teacher</span></h2>
            <p className="muted">Begin a live session with real-time captions for every student.</p>
            <div className="field">
              <label htmlFor="title">Class title</label>
              <input id="title" ref={titleRef} className="input" required maxLength={120} placeholder="e.g. Physics — Newton’s laws" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="field">
                <label htmlFor="lang">Spoken language</label>
                <select id="lang" className="select" value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}>
                  {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="when">Scheduled start <span className="muted">(optional)</span></label>
                <input id="when" className="input" type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-primary btn-lg btn-block" disabled={busy}><Plus size={18} aria-hidden="true" /> {busy ? 'Creating…' : 'Create class'}</button>
          </form>
        )}

        <form className="card role-card" onSubmit={join} aria-labelledby="join-h" noValidate>
          <div className="role-icon" aria-hidden="true"><DoorOpen size={28} /></div>
          <h2 id="join-h">Join a class <span className="muted role-tag">Student</span></h2>
          <p className="muted">Enter the class code shared by your teacher.</p>
          <div className="field">
            <label htmlFor="code">Class code</label>
            <input id="code" ref={codeRef} className="input mono code-input" maxLength={6} autoComplete="off" placeholder="ABC123" value={joinCode}
              onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); }}
              aria-invalid={Boolean(joinError)} aria-describedby={joinError ? 'join-error' : undefined} />
            {joinError && <div id="join-error" className="error-text" role="alert" style={{ marginBottom: 0 }}>{joinError}</div>}
          </div>
          <ul className="join-tips" aria-label="Tips for joining">
            <li><span>The code is <b>6 letters and numbers</b>, like <span className="mono">ABC123</span>.</span></li>
            <li><span>No code? Open the <b>invite link</b> your teacher shared.</span></li>
            <li><span>Turn on <b>alerts</b> in the class so you’re flashed when your name is said.</span></li>
          </ul>
          <button className="btn btn-primary btn-lg btn-block">Join class</button>
        </form>
      </div>

      {(isTeacher || (rooms && rooms.length > 0)) && (
        <section className="card" style={{ marginTop: 'var(--gap)' }} aria-labelledby="classes-h">
          <div className="row between wrap" style={{ marginBottom: 14 }}>
            <h2 id="classes-h" style={{ fontSize: 18 }}>Your classes</h2>
            <div className="toolbar" style={{ marginBottom: 0 }}>
              <div className="search">
                <Search size={16} aria-hidden="true" />
                <input className="input" type="search" placeholder="Search by title or code" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search your classes" />
              </div>
              <div className="pill-group" role="group" aria-label="Filter classes">
                {FILTERS.map(([id, label]) => <button key={id} className={`pill ${filter === id ? 'on' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
              </div>
            </div>
          </div>

          {rooms === null ? <LoadingState label="Loading your classes…" />
            : loadError ? <ErrorState message={loadError} onRetry={load} />
            : rooms.length === 0 ? <EmptyState icon={Captions} title="No classes yet">Classes you start will appear here, with their transcripts.</EmptyState>
            : shown.length === 0 ? <EmptyState icon={Search} title="No classes match">Try a different search or filter.</EmptyState> : (
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">Classes you have hosted</caption>
                  <thead><tr><th scope="col">Class</th><th scope="col">Code</th><th scope="col">Status</th><th scope="col">Captions</th><th scope="col">Started</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {shown.map((r) => {
                      const upcoming = r.active && r.scheduledAt && new Date(r.scheduledAt) > new Date();
                      return (
                        <tr key={r.id}>
                          <th scope="row" style={{ textAlign: 'left', fontWeight: 700 }}>{r.title}</th>
                          <td className="mono">{r.code}</td>
                          <td>{upcoming ? <StatusBadge status="scheduled">Scheduled {new Date(r.scheduledAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</StatusBadge>
                            : r.active ? <StatusBadge status="live">Live</StatusBadge> : <StatusBadge status="ended">Ended</StatusBadge>}</td>
                          <td>{r.captionCount}</td>
                          <td>{formatDate(r.createdAt)}</td>
                          <td>
                            <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                              <button className="btn btn-outline btn-sm" onClick={() => navigate(`/classroom/${r.code}`)}>{r.active ? 'Open' : 'Transcript'}</button>
                              {!r.active && <button className="btn btn-ghost btn-sm" onClick={() => reopen(r)}>Reopen</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </section>
      )}
    </>
  );
}
