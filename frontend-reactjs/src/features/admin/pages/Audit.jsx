import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import * as api from '../../../api';
import Pager from '../../../components/Pager';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../../components/ui';

const ACTIONS = [
  ['', 'All actions'], ['user.role_change', 'Role changes'], ['user.delete', 'Users deleted'], ['class.create', 'Classes created'],
  ['class.end', 'Classes ended'], ['class.reopen', 'Classes reopened'], ['class.member_role', 'Captioner changes'], ['language.delete', 'Languages deleted'],
];
const describe = (r) => {
  const m = r.meta || {};
  switch (r.action) {
    case 'user.role_change': return `${m.email || r.targetId}: ${m.from} → ${m.to}`;
    case 'user.delete': return `${m.email || r.targetId}${m.hostedClassrooms ? ` (hosted ${m.hostedClassrooms} classes)` : ''}`;
    case 'class.create': return `${m.title || ''} (${m.code})`;
    case 'class.end': case 'class.reopen': return `Class ${m.code}`;
    case 'class.member_role': return `Class ${m.code}: ${m.role}`;
    default: return r.targetId || '';
  }
};

// Append-only history of sensitive actions, for admins.
export default function Audit() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => { setError(''); api.admin.audit({ page, action }).then((r) => setData(r.data)).catch((e) => setError(e.message)); };
  useEffect(load, [page, action]);

  return (
    <>
      <PageHeader icon={ScrollText} title="Audit log" subtitle="Who changed what, and when. Entries cannot be edited or deleted here."
        actions={(
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="audit-action" className="sr-only">Filter by action</label>
            <select id="audit-action" className="select" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
              {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        )} />
      <div className="card">
        {error ? <ErrorState message={error} onRetry={load} /> : !data ? <LoadingState label="Loading the audit log…" /> : data.rows.length === 0 ? <EmptyState icon={ScrollText} title="Nothing recorded yet">Role changes, deleted users and class actions will appear here.</EmptyState> : (
          <>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Audit log</caption>
                <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Details</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                      <td>{r.actorName || '—'}</td>
                      <td><code>{r.action}</code></td>
                      <td>{describe(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={data.page} totalPages={data.pages} onChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}
