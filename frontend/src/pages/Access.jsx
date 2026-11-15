import { useEffect, useState } from 'react';
import { Check, Minus, ShieldCheck } from 'lucide-react';
import * as api from '../api';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../lib';
import { ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/ui';

const COLUMNS = [['USER', 'Student'], ['TEACHER', 'Teacher'], ['ADMIN', 'Admin']];
const IN_CLASS = [
  ['Host', 'The teacher who started the class, or any admin', 'End or reopen the class, change settings and gestures, give captioner rights, see attendance'],
  ['Captioner', 'A student the host trusts', 'Correct captions, lower raised hands, see class insights'],
  ['Student', 'Everyone else who joined', 'Read and send captions, raise a hand, use notes and ask the lecture'],
];

// A plain table of what each role can do, so access rules are visible, not hidden in code.
export default function Access() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => { setError(''); api.users.permissions().then((r) => setData(r.data)).catch((e) => setError(e.message)); };
  useEffect(load, []);

  const mine = user.role === 'MODERATOR' ? 'USER' : user.role;
  return (
    <>
      <PageHeader icon={ShieldCheck} title="Roles & permissions" subtitle="What each kind of account can do in EchoSign. Your column is highlighted." />
      {error ? <div className="card"><ErrorState message={error} onRetry={load} /></div> : !data ? <div className="card"><LoadingState label="Loading permissions…" /></div> : (
        <>
          <section className="card" aria-labelledby="matrix-h" style={{ marginBottom: 'var(--gap)' }}>
            <div className="row between wrap" style={{ marginBottom: 12 }}>
              <h2 id="matrix-h" className="card-title" style={{ marginBottom: 0 }}>Account roles</h2>
              <span>You are signed in as <StatusBadge status="info">{roleLabel(user.role)}</StatusBadge></span>
            </div>
            <div className="table-wrap">
              <table className="table access-table">
                <caption className="sr-only">Which account roles may perform each action</caption>
                <thead>
                  <tr><th scope="col">Action</th>{COLUMNS.map(([id, label]) => <th key={id} scope="col" className={id === mine ? 'me' : ''}>{label}{id === mine ? ' (you)' : ''}</th>)}</tr>
                </thead>
                <tbody>
                  {data.matrix.map((row) => (
                    <tr key={row.key}>
                      <th scope="row" style={{ textAlign: 'left', fontWeight: 600 }}>{row.label}</th>
                      {COLUMNS.map(([id]) => (
                        <td key={id} className={id === mine ? 'me' : ''}>
                          {row[id]
                            ? <span className="tick yes"><Check size={16} aria-hidden="true" /><span className="sr-only">Allowed</span></span>
                            : <span className="tick no"><Minus size={16} aria-hidden="true" /><span className="sr-only">Not allowed</span></span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card" aria-labelledby="class-h">
            <h2 id="class-h" className="card-title">Roles inside a class</h2>
            <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>Separate from your account role: your role in a class depends on who you are in that class.</p>
            <dl className="kv">
              {IN_CLASS.map(([name, who, can]) => <div key={name} style={{ display: 'contents' }}><dt>{name}</dt><dd>{who}. <span className="muted">{can}.</span></dd></div>)}
            </dl>
          </section>
        </>
      )}
    </>
  );
}
