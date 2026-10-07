import { useCallback, useEffect, useState } from 'react';
import { Search, Trash2, Users as UsersIcon } from 'lucide-react';
import * as api from '../../api';
import Pager from '../../components/Pager';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, useConfirm } from '../../components/ui';
import { ROLE_LABEL, formatDate } from '../../lib';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

// Hierarchy, highest first in the badge order: Administrator > Teacher > Member.
const ROLES = ['USER', 'TEACHER', 'ADMIN'];

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ users: [], totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Debounce the search box.
  useEffect(() => { const t = setTimeout(() => { setQuery(search); setPage(1); }, 350); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData((await api.admin.users({ page, limit: 15, search: query, role })).data); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [page, query, role]);
  useEffect(() => { load(); }, [load]);

  const changeRole = async (u, newRole) => {
    try {
      await api.admin.setRole(u.id, newRole);
      setData((d) => ({ ...d, users: d.users.map((x) => (x.id === u.id ? { ...x, role: newRole } : x)) }));
      toast(`${u.username} is now ${ROLE_LABEL[newRole]}`, 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const remove = async (u) => {
    const ok = await confirm({ title: `Delete ${u.username}?`, body: 'Their sessions, messages and hosted classes are removed permanently. This cannot be undone.', confirmLabel: 'Delete user', danger: true });
    if (!ok) return;
    try { await api.admin.deleteUser(u.id); toast('User deleted', 'success'); load(); }
    catch (err) { toast(err.message, 'error'); }
  };

  const filtered = Boolean(query || role);

  return (
    <>
      <PageHeader icon={UsersIcon} title="Users" subtitle={`${data.total} ${data.total === 1 ? 'account' : 'accounts'}${filtered ? ' match your filters' : ''}.`} />
      <div className="card">
        <div className="toolbar">
          <div className="search"><Search size={16} aria-hidden="true" /><input className="input" type="search" placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search users" /></div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="u-role" className="sr-only">Filter by role</label>
            <select id="u-role" className="select" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
              <option value="">All roles</option>{[...ROLES, 'MODERATOR'].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
        </div>

        {loading ? <LoadingState label="Loading users…" />
          : error ? <ErrorState message={error} onRetry={load} />
          : data.users.length === 0 ? <EmptyState icon={UsersIcon} title="No users match">Try a different search or role.</EmptyState> : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">User accounts</caption>
                <thead><tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Sessions</th><th scope="col">Avg. accuracy</th><th scope="col">Joined</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {data.users.map((u) => {
                    const self = u.id === me.id;
                    return (
                      <tr key={u.id}>
                        <th scope="row" style={{ textAlign: 'left' }}><b>{u.username}</b> {self && <span className="badge badge-info">You</span>}<div className="muted" style={{ fontSize: 13, fontWeight: 500 }}>{u.email}</div></th>
                        <td>
                          <label className="sr-only" htmlFor={`role-${u.id}`}>Role for {u.username}</label>
                          <select id={`role-${u.id}`} className="select" style={{ width: 'auto', minHeight: 38, padding: '4px 12px' }} value={u.role} disabled={self} onChange={(e) => changeRole(u, e.target.value)}>
                            {(ROLES.includes(u.role) ? ROLES : [...ROLES, u.role]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                          </select>
                        </td>
                        <td>{u.emailVerified ? <StatusBadge status="ok">Verified</StatusBadge> : <StatusBadge status="warn">Unverified</StatusBadge>}</td>
                        <td>{u.profile?.totalSessions ?? 0}</td>
                        <td>{Math.round(u.profile?.avgAccuracy ?? 0)}%</td>
                        <td>{formatDate(u.createdAt)}</td>
                        <td><button className="btn btn-ghost btn-sm btn-icon" disabled={self} onClick={() => remove(u)} aria-label={`Delete ${u.username}`}><Trash2 size={16} aria-hidden="true" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        <Pager page={page} totalPages={data.totalPages} onChange={setPage} />
      </div>
    </>
  );
}
