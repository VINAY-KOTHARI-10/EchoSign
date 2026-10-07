import { useCallback, useEffect, useState } from 'react';
import { Crown, Flame, Trophy } from 'lucide-react';
import * as api from '../api';
import { useAuth } from '../context/AuthContext';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';
import SegmentNav from '../components/SegmentNav';

const MEDALS = ['Gold', 'Silver', 'Bronze'];

function PodiumCard({ row, rank, isMe }) {
  return (
    <li className={`podium rank-${rank}`} aria-label={`Rank ${rank}: ${row.username}, ${row.totalSessions} sessions`}>
      <div className="podium-medal" aria-hidden="true">{rank === 1 ? <Crown size={20} /> : rank}</div>
      <div className="avatar" aria-hidden="true">{(row.username || '?')[0].toUpperCase()}</div>
      <b className="podium-name">{row.username}{isMe && <span className="badge badge-info" style={{ marginLeft: 6 }}>You</span>}</b>
      <span className="podium-score">{row.totalSessions}<small> sessions</small></span>
      <span className="muted" style={{ fontSize: 12 }}>{MEDALS[rank - 1]} · {row.totalMinutes ?? 0} min · <Flame size={12} aria-hidden="true" style={{ display: 'inline' }} /> {row.streak?.current ?? 0}-day streak</span>
    </li>
  );
}

export default function Leaderboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api.users.leaderboard().then((r) => setRows(r.data.leaderboard || [])).catch((e) => { setError(e.message); setRows([]); }); }, []);
  useEffect(() => { load(); }, [load]);

  const top = rows?.slice(0, 3) || [];
  const rest = rows?.slice(3) || [];
  const leaderScore = Math.max(1, rows?.[0]?.totalSessions || 1);

  return (
    <>
      <PageHeader icon={Trophy} title="Leaderboard" subtitle="The most active learners, ranked by completed practice sessions." />
      <SegmentNav />

      {rows === null ? <div className="card"><LoadingState label="Loading the leaderboard…" /></div>
        : error ? <div className="card"><ErrorState message={error} onRetry={load} /></div>
        : rows.length === 0 ? <div className="card"><EmptyState icon={Trophy} title="No one is on the board yet">Complete a practice session to be the first.</EmptyState></div> : (
          <>
            <ol className="podium-row" aria-label="Top three">
              {top.map((r, i) => <PodiumCard key={r.userId} row={r} rank={i + 1} isMe={r.userId === user.id} />)}
            </ol>

            {rest.length > 0 && (
              <section className="card" style={{ marginTop: 20 }} aria-labelledby="rest-h">
                <h2 id="rest-h" className="card-title">Rankings</h2>
                <ol className="rank-list" start={4}>
                  {rest.map((r, i) => (
                    <li key={r.userId} className={r.userId === user.id ? 'me' : ''} aria-label={`Rank ${i + 4}: ${r.username}, ${r.totalSessions} sessions`}>
                      <span className="rank" aria-hidden="true">{i + 4}</span>
                      <span className="avatar" style={{ width: 36, height: 36 }} aria-hidden="true">{(r.username || '?')[0].toUpperCase()}</span>
                      <span className="rank-name"><b>{r.username}</b>{r.userId === user.id && <span className="badge badge-info" style={{ marginLeft: 8 }}>You</span>}</span>
                      <span className="rank-bar" aria-hidden="true"><i style={{ width: `${(r.totalSessions / leaderScore) * 100}%` }} /></span>
                      <span className="rank-score">{r.totalSessions} <small className="muted">sessions</small></span>
                      <span className="badge badge-warn"><Flame size={12} aria-hidden="true" /> {r.streak?.current ?? 0}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
    </>
  );
}
