import { useCallback, useEffect, useState } from 'react';
import { Activity, Captions, Globe, LayoutDashboard, Mic, Radio, ShieldCheck, Target, UserPlus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import * as api from '../../api';
import { formatDate, langName } from '../../lib';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../../components/ui';

export default function Overview() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api.admin.stats().then((r) => setS(r.data)).catch((e) => setError(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <><PageHeader icon={LayoutDashboard} title="Admin panel" /><div className="card"><ErrorState message={error} onRetry={load} /></div></>;
  if (!s) return <><PageHeader icon={LayoutDashboard} title="Admin panel" /><div className="card"><LoadingState label="Loading overview…" /></div></>;

  const cards = [
    { icon: Users, label: 'Total users', value: s.userCount, bg: 'var(--violet-light)', color: 'var(--violet-dark)' },
    { icon: Users, label: 'Students', value: s.studentCount ?? 0, bg: 'var(--mint)', color: 'var(--go)' },
    { icon: Users, label: 'Teachers', value: s.teacherCount ?? 0, bg: 'var(--mint)', color: 'var(--go)' },
    { icon: Radio, label: 'Online now', value: s.onlineNow ?? 0, bg: 'var(--peach)', color: '#9a3412' },
    { icon: Activity, label: 'Active this week', value: s.activeUsers7d ?? 0, bg: 'var(--violet-light)', color: 'var(--violet-dark)' },
    { icon: UserPlus, label: 'New this week', value: s.newUsersWeek, bg: 'var(--mint)', color: 'var(--go)' },
    { icon: Captions, label: 'Live classes', value: `${s.activeClassrooms} of ${s.classroomCount}`, bg: 'var(--peach)', color: '#9a3412' },
    { icon: Captions, label: 'Completed classes', value: s.completedClassrooms ?? 0, bg: 'var(--mint)', color: 'var(--go)' },
    { icon: Mic, label: 'Practice sessions', value: s.sessionCount, bg: '#fef3c7', color: '#8a4a05' },
    { icon: Activity, label: 'Sessions (24h)', value: s.sessionsToday, bg: 'var(--violet-light)', color: 'var(--violet-dark)' },
    { icon: Target, label: 'Average accuracy', value: `${s.avgAccuracy}%`, bg: 'var(--mint)', color: 'var(--go)' },
    { icon: Captions, label: 'Captions sent', value: s.captionCount, bg: 'var(--peach)', color: '#9a3412' },
    { icon: Globe, label: 'Languages', value: s.languageCount, bg: '#fef3c7', color: '#8a4a05' },
    { icon: ShieldCheck, label: 'Administrators', value: s.adminCount, bg: '#e8e8f4', color: 'var(--ink)' },
  ];
  const max = Math.max(1, ...s.sessionsByLanguage.map((l) => l.count));

  return (
    <>
      <PageHeader icon={LayoutDashboard} title="Admin panel" subtitle="Platform activity at a glance." />

      <ul className="grid-stats plain-grid" style={{ marginBottom: 'var(--gap)' }} aria-label="Key numbers">
        {cards.map(({ icon: Icon, label, value, bg, color }) => (
          <li className="card stat" key={label}>
            <div className="stat-icon" style={{ background: bg, color }} aria-hidden="true"><Icon size={20} /></div>
            <div className="num">{value}</div><div className="label">{label}</div>
          </li>
        ))}
      </ul>

      {s.services && (
        <section className="card" aria-labelledby="svc-h" style={{ marginBottom: 'var(--gap)' }}>
          <h2 id="svc-h" className="card-title">Services</h2>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Whether each outside service is configured on this server (not whether it is up right now).</p>
          <ul className="pill-group plain-grid" style={{ display: 'flex' }}>
            <li><StatusBadge status={s.services.ai.configured ? 'ok' : 'warn'}>AI notes and Q&A: {s.services.ai.configured ? `on (${s.services.ai.model})` : 'not configured, using basic fallbacks'}</StatusBadge></li>
            <li><StatusBadge status={s.services.email.configured ? 'ok' : 'warn'}>Login-code email: {s.services.email.configured ? 'configured' : 'NOT configured, nobody can verify an account'}</StatusBadge></li>
            <li><StatusBadge status={s.services.googleSignIn.configured ? 'ok' : 'off'}>Google sign-in: {s.services.googleSignIn.configured ? 'on' : 'off'}</StatusBadge></li>
          </ul>
        </section>
      )}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section className="card" aria-labelledby="recent-h">
          <div className="row between"><h2 id="recent-h" className="card-title" style={{ marginBottom: 0 }}>Recent signups</h2><Link to="/admin/users" className="link" style={{ fontSize: 13 }}>View all users</Link></div>
          {s.recentUsers.length === 0 ? <EmptyState icon={Users} title="No users yet" /> : (
            <ul className="list-rows">
              {s.recentUsers.map((u) => (
                <li key={u.id} className="row">
                  <div className="avatar" style={{ width: 36, height: 36 }} aria-hidden="true">{u.username[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><b>{u.username}</b><div className="muted" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div></div>
                  {u.role === 'ADMIN' && <StatusBadge status="info">Admin</StatusBadge>}
                  <span className="muted" style={{ fontSize: 13 }}>{formatDate(u.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="lang-h">
          <h2 id="lang-h" className="card-title">Practice sessions by language</h2>
          {s.sessionsByLanguage.length === 0 ? <EmptyState icon={Mic} title="No sessions yet" /> : (
            <ul className="bar-list">
              {s.sessionsByLanguage.map((l) => (
                <li key={l.language}>
                  <div className="row between" style={{ fontSize: 14, fontWeight: 700 }}><span>{langName(l.language)}</span><span>{l.count}</span></div>
                  <div className="bar" aria-hidden="true"><i style={{ width: `${(l.count / max) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
