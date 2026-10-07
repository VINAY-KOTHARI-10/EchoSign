import { useCallback, useEffect, useState } from 'react';
import { Mic, Search } from 'lucide-react';
import * as api from '../../api';
import Pager from '../../components/Pager';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../../components/ui';
import { LANGS, formatDate, formatDuration, langName } from '../../lib';

const tone = (n) => (n >= 80 ? 'ok' : n >= 60 ? 'warn' : 'error');

export default function Sessions() {
  const [language, setLanguage] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ sessions: [], totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { const t = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData((await api.admin.sessions({ page, limit: 15, language, q: query })).data); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [page, language, query]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader icon={Mic} title="Practice sessions" subtitle={`${data.total} ${data.total === 1 ? 'session' : 'sessions'} across all users.`} />
      <div className="card">
        <div className="toolbar">
          <div className="search"><Search size={16} aria-hidden="true" /><input className="input" type="search" placeholder="Search by user name or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search sessions by user" /></div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="s-lang" className="sr-only">Filter by language</label>
            <select id="s-lang" className="select" value={language} onChange={(e) => { setLanguage(e.target.value); setPage(1); }}>
              <option value="">All languages</option>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </div>
        </div>

        {loading ? <LoadingState label="Loading sessions…" />
          : error ? <ErrorState message={error} onRetry={load} />
          : data.sessions.length === 0 ? <EmptyState icon={Mic} title="No sessions found">Try a different search or language.</EmptyState> : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Practice sessions</caption>
                <thead><tr><th scope="col">User</th><th scope="col">Language</th><th scope="col">Accuracy</th><th scope="col">Words</th><th scope="col">Duration</th><th scope="col">Date</th></tr></thead>
                <tbody>
                  {data.sessions.map((s) => (
                    <tr key={s.id}>
                      <th scope="row" style={{ textAlign: 'left' }}><b>{s.user?.username}</b><div className="muted" style={{ fontSize: 13, fontWeight: 500 }}>{s.user?.email}</div></th>
                      <td>{langName(s.language)}</td>
                      <td><StatusBadge status={tone(s.accuracy)}>{Math.round(s.accuracy)}%</StatusBadge></td>
                      <td>{s.wordsCorrect}/{s.wordsAttempted}</td>
                      <td>{formatDuration(s.duration)}</td>
                      <td>{formatDate(s.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <Pager page={page} totalPages={data.totalPages} onChange={setPage} />
      </div>
    </>
  );
}
