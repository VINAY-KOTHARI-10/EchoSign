import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Captions, Search } from 'lucide-react';
import * as api from '../../api';
import Pager from '../../components/Pager';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, useConfirm } from '../../components/ui';
import { formatDate, langName } from '../../lib';
import { useToast } from '../../context/ToastContext';

export default function Classrooms() {
  const toast = useToast();
  const confirm = useConfirm();
  const [active, setActive] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ classrooms: [], totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { const t = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData((await api.admin.classrooms({ page, limit: 15, active, q: query })).data); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [page, active, query]);
  useEffect(() => { load(); }, [load]);

  const end = async (c) => {
    const ok = await confirm({ title: `End “${c.title}”?`, body: 'Captioning stops for everyone in the class. The host can reopen it later.', confirmLabel: 'End class', danger: true });
    if (!ok) return;
    try { await api.classrooms.end(c.code); toast('Class ended', 'success'); load(); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <>
      <PageHeader icon={Captions} title="Classrooms" subtitle={`${data.total} ${data.total === 1 ? 'class' : 'classes'}.`} />
      <div className="card">
        <div className="toolbar">
          <div className="search"><Search size={16} aria-hidden="true" /><input className="input" type="search" placeholder="Search by title, code or teacher" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search classrooms" /></div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="c-status" className="sr-only">Filter by status</label>
            <select id="c-status" className="select" value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }}>
              <option value="">All statuses</option><option value="true">Live</option><option value="false">Ended</option>
            </select>
          </div>
        </div>

        {loading ? <LoadingState label="Loading classes…" />
          : error ? <ErrorState message={error} onRetry={load} />
          : data.classrooms.length === 0 ? <EmptyState icon={Captions} title="No classes found">Try a different search or status.</EmptyState> : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Classrooms</caption>
                <thead><tr><th scope="col">Class</th><th scope="col">Teacher</th><th scope="col">Code</th><th scope="col">Language</th><th scope="col">Captions</th><th scope="col">Status</th><th scope="col">Started</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {data.classrooms.map((c) => (
                    <tr key={c.id}>
                      <th scope="row" style={{ textAlign: 'left' }}>{c.title}</th>
                      <td>{c.host?.username}<div className="muted" style={{ fontSize: 13 }}>{c.host?.email}</div></td>
                      <td className="mono">{c.code}</td>
                      <td>{langName(c.language)}</td>
                      <td>{c._count?.captions ?? 0}</td>
                      <td>{c.active ? <StatusBadge status="live">Live</StatusBadge> : <StatusBadge status="ended">Ended</StatusBadge>}</td>
                      <td>{formatDate(c.createdAt)}</td>
                      <td>
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                          <Link to={`/classroom/${c.code}`} className="btn btn-outline btn-sm">View</Link>
                          {c.active && <button className="btn btn-danger-soft btn-sm" onClick={() => end(c)}>End</button>}
                        </div>
                      </td>
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
