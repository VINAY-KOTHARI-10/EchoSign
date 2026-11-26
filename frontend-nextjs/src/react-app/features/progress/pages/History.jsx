// History - session history and replay
import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, History as HistoryIcon, Search, Trash2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import * as api from '../../../api';
import Pager from '../../../components/Pager';
import { EmptyState, ErrorState, LoadingState, Modal, PageHeader, StatusBadge, TabPanel, Tabs, useConfirm } from '../../../components/ui';
import { formatDate, formatDuration, langName } from '../../../lib';
import { useLanguages } from '../../../lib/languages';
import SegmentNav from '../components/SegmentNav';
import { useToast } from '../../../context/ToastContext';

const TABS = [{ id: 'practice', label: 'Practice sessions' }, { id: 'classes', label: 'Classes I hosted' }];
const tone = (n) => (n >= 80 ? 'ok' : n >= 60 ? 'warn' : 'error');

function PracticeHistory() {
  const langs = useLanguages();
  const toast = useToast();
  const confirm = useConfirm();
  const [language, setLanguage] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const queryClient = useQueryClient();

  // Debounce the search box so we don't query on every keystroke.
  useEffect(() => { const t = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [search]);

  // Server state: each (page, language, search) result is cached by React Query.
  const sessionsQ = useQuery({
    queryKey: ['sessions', page, language, query],
    queryFn: () => api.sessions.list({ page, limit: 10, language, search: query }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const data = sessionsQ.data ?? { sessions: [], pagination: null };
  const loading = sessionsQ.isPending || sessionsQ.isPlaceholderData;
  const error = sessionsQ.error ? sessionsQ.error.message : '';
  const load = () => sessionsQ.refetch();

  const remove = async (s) => {
    const ok = await confirm({ title: 'Delete this session?', body: `The ${langName(s.language)} session from ${formatDate(s.createdAt)} will be removed from your history.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.sessions.remove(s.id); toast('Session deleted', 'success'); queryClient.invalidateQueries({ queryKey: ['sessions'] }); queryClient.invalidateQueries({ queryKey: ['progress'] }); }
    catch (err) { toast(err.message, 'error'); }
  };

  const filtered = Boolean(query || language);

  return (
    <div className="card">
      <div className="toolbar">
        <div className="search">
          <Search size={16} aria-hidden="true" />
          <input className="input" type="search" placeholder="Search transcripts and feedback" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search your sessions" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="h-lang" className="sr-only">Language</label>
          <select id="h-lang" className="select" value={language} onChange={(e) => { setLanguage(e.target.value); setPage(1); }}>
            <option value="">All languages</option>{langs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? <LoadingState label="Loading sessions…" />
        : error ? <ErrorState message={error} onRetry={load} />
        : data.sessions.length === 0 ? (
          <EmptyState icon={HistoryIcon} title={filtered ? 'No sessions match' : 'No sessions yet'}>{filtered ? 'Try a different search or language.' : 'Your practice sessions will appear here with their transcripts.'}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Your practice sessions</caption>
              <thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Language</th><th scope="col">Accuracy</th><th scope="col">Duration</th><th scope="col">Transcript</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{formatDate(s.createdAt)}</td>
                    <td>Practice</td>
                    <td>{langName(s.language)}</td>
                    <td><StatusBadge status={tone(s.accuracy)}>{Math.round(s.accuracy)}%</StatusBadge></td>
                    <td>{formatDuration(s.duration)}</td>
                    <td className="clamp">{s.transcript ? `“${s.transcript}”` : <span className="muted">Not saved</span>}</td>
                    <td>
                      <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => setDetail(s)}><Eye size={14} aria-hidden="true" /> Details</button>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => remove(s)} aria-label={`Delete the ${langName(s.language)} session from ${formatDate(s.createdAt)}`}><Trash2 size={16} aria-hidden="true" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <Pager page={page} totalPages={data.pagination?.totalPages} onChange={setPage} />

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="Session details" wide>
        {detail && (
          <dl className="kv" style={{ marginTop: 12 }}>
            <dt>Date</dt><dd>{new Date(detail.createdAt).toLocaleString()}</dd>
            <dt>Language</dt><dd>{langName(detail.language)}</dd>
            <dt>Accuracy</dt><dd><StatusBadge status={tone(detail.accuracy)}>{Math.round(detail.accuracy)}%</StatusBadge></dd>
            <dt>Words correct</dt><dd>{detail.wordsCorrect} of {detail.wordsAttempted}</dd>
            <dt>Duration</dt><dd>{formatDuration(detail.duration)}</dd>
            <dt>What you said</dt><dd>{detail.transcript || 'No transcript was saved.'}</dd>
            <dt>Feedback</dt><dd>{detail.feedback || 'No feedback was saved.'}</dd>
          </dl>
        )}
      </Modal>
    </div>
  );
}

function ClassHistory() {
  const [query, setQuery] = useState('');
  const roomsQ = useQuery({ queryKey: ['classrooms', 'mine'], queryFn: () => api.classrooms.mine().then((r) => r.data.classrooms) });
  const rooms = roomsQ.isPending ? null : (roomsQ.data ?? []);
  const error = roomsQ.error ? roomsQ.error.message : '';
  const load = () => roomsQ.refetch();
  const shown = (rooms || []).filter((r) => !query.trim() || r.title.toLowerCase().includes(query.trim().toLowerCase()) || r.code.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="card">
      <div className="toolbar">
        <div className="search"><Search size={16} aria-hidden="true" /><input className="input" type="search" placeholder="Search by title or code" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search your classes" /></div>
      </div>
      {rooms === null ? <LoadingState label="Loading classes…" />
        : error ? <ErrorState message={error} onRetry={load} />
        : shown.length === 0 ? <EmptyState icon={HistoryIcon} title={rooms.length ? 'No classes match' : 'No classes yet'}>{rooms.length ? 'Try a different search.' : <>Classes you host will appear here. <Link to="/classroom" className="link">Start a class</Link></>}</EmptyState> : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Classes you have hosted</caption>
              <thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Class</th><th scope="col">Language</th><th scope="col">Captions</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{shown.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.createdAt)}</td><td>Classroom</td><th scope="row" style={{ textAlign: 'left', fontWeight: 700 }}>{r.title}</th><td>{langName(r.language)}</td><td>{r.captionCount}</td>
                  <td>{r.active ? <StatusBadge status="live">Live</StatusBadge> : <StatusBadge status="ended">Ended</StatusBadge>}</td>
                  <td style={{ textAlign: 'right' }}><Link to={`/classroom/${r.code}`} className="btn btn-outline btn-sm">{r.active ? 'Open' : 'View transcript'}</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
    </div>
  );
}

export default function History() {
  // The open tab is kept in the address (?tab=classes), so it survives a refresh and can be linked to.
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'classes' ? 'classes' : 'practice';
  const setTab = (t) => setParams(t === 'practice' ? {} : { tab: t });
  return (
    <>
      <PageHeader icon={HistoryIcon} title="History" subtitle="Review your past practice sessions and the classes you have hosted." />
      <SegmentNav />
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="History sections" idPrefix="hist" />
      <TabPanel id="practice" active={tab === 'practice'} idPrefix="hist"><PracticeHistory /></TabPanel>
      <TabPanel id="classes" active={tab === 'classes'} idPrefix="hist"><ClassHistory /></TabPanel>
    </>
  );
}

