import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import * as api from '../../api';
import { csv, downloadText, safeName } from '../../lib/captions';
import { formatDate } from '../../lib';
import { useToast } from '../../context/ToastContext';

const SOURCES = [['SPEECH', 'Speech', 'var(--violet)'], ['SIGN', 'Sign', '#14b8a6'], ['TEXT', 'Typed', '#f59e0b']];

// Teacher dashboard: caption mix, who spoke how much, attendance, and roles.
export default function InsightsPanel({ room, isHost, active }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData((await api.classrooms.insights(room.code)).data); }
    catch (err) { toast(err.message, 'error'); }
    finally { setLoading(false); }
  }, [room.code, toast]);

  useEffect(() => {
    load();
    if (!active) return undefined;
    const t = setInterval(load, 20000); // keep attendance fresh while the class is running
    return () => clearInterval(t);
  }, [load, active]);

  const setRole = async (m, role) => {
    try {
      await api.classrooms.setRole(room.code, m.userId, role);
      setData((d) => ({ ...d, attendance: d.attendance.map((x) => (x.userId === m.userId ? { ...x, role } : x)) }));
      toast(role === 'CAPTIONER' ? `${m.username} can now correct captions` : `${m.username} is a student again`, 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const exportCsv = () => downloadText(`${safeName(room.title)}-attendance.csv`, csv([
    ['Name', 'Role', 'Joins', 'Minutes in class', 'First joined', 'Last seen'],
    ...data.attendance.map((m) => [m.username, m.role, m.joins, m.minutes, m.firstJoinedAt, m.lastSeenAt]),
  ]), 'text/csv');

  if (!data) return <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>;
  const total = Math.max(1, data.totalCaptions);

  return (
    <div className="stack">
      <div className="row between">
        <div className="muted" style={{ fontSize: 14 }}>{active ? 'Updates every 20 seconds while the class is live.' : 'Final numbers for this class.'}</div>
        <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}><RefreshCw size={15} /> Refresh</button>
      </div>

      <div className="grid grid-4">
        {[['Captions', data.totalCaptions], ['Active minutes', data.activeMinutes], ['Corrected', data.corrected], ['People who joined', data.attendance.length]].map(([label, value]) => (
          <div className="card stat" key={label}><div className="num">{value}</div><div className="label">{label}</div></div>
        ))}
      </div>

      <div className="card">
        <h2 className="card-title">How the class communicated</h2>
        <div className="source-bar" role="img" aria-label="Share of captions by input method">
          {SOURCES.map(([k, , color]) => data.bySource[k] > 0 && <i key={k} style={{ width: `${(data.bySource[k] / total) * 100}%`, background: color }} />)}
        </div>
        <div className="row wrap" style={{ gap: 18, marginTop: 10, fontSize: 14 }}>
          {SOURCES.map(([k, label, color]) => <span key={k} className="row" style={{ gap: 6 }}><i className="dot" style={{ background: color }} />{label} <b>{data.bySource[k] || 0}</b></span>)}
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Who contributed</h2>
        {data.speakers.length === 0 ? <div className="empty">No captions yet.</div> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Person</th><th>Captions</th><th>Words</th><th>Speech / Sign / Typed</th><th>≈ Minutes speaking</th></tr></thead>
            <tbody>{data.speakers.map((s) => (
              <tr key={s.userId || s.username}><td><b>{s.username}</b></td><td>{s.captions}</td><td>{s.words}</td>
                <td className="mono">{s.bySource.SPEECH} / {s.bySource.SIGN} / {s.bySource.TEXT}</td><td>{s.estSpeakingMinutes}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Speaking time is estimated from the number of spoken words (150 words per minute).</p>
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Attendance</h2>
          <button className="btn btn-outline btn-sm" onClick={exportCsv} disabled={!data.attendance.length}><Download size={15} /> CSV</button>
        </div>
        {data.attendance.length === 0 ? <div className="empty">Nobody has joined yet.</div> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Name</th><th>Role</th><th>Joins</th><th>Minutes</th><th>First joined</th></tr></thead>
            <tbody>{data.attendance.map((m) => (
              <tr key={m.userId}>
                <td><b>{m.username}</b></td>
                <td>{m.role === 'HOST' || !isHost
                  ? <span className={`chip ${m.role === 'HOST' ? '' : m.role === 'CAPTIONER' ? 'chip-go' : ''}`}>{m.role === 'HOST' ? 'Teacher' : m.role === 'CAPTIONER' ? 'Captioner' : 'Student'}</span>
                  : (
                    <select className="select" style={{ width: 'auto', padding: '6px 12px' }} value={m.role} onChange={(e) => setRole(m, e.target.value)} aria-label={`Role for ${m.username}`}>
                      <option value="STUDENT">Student</option><option value="CAPTIONER">Captioner (can correct captions)</option>
                    </select>
                  )}</td>
                <td>{m.joins}</td><td>{m.minutes}</td><td>{formatDate(m.firstJoinedAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
