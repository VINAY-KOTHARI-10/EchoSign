import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Mic, Users } from 'lucide-react';
import * as api from '../../../api';
import { formatDate, langName } from '../../../lib';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../../../components/ui';

export default function Overview() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api.admin.stats().then((r) => setS(r.data)).catch((e) => setError(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <><PageHeader icon={LayoutDashboard} title="Overview" /><div className="card"><ErrorState message={error} onRetry={load} /></div></>;
  if (!s) return <><PageHeader icon={LayoutDashboard} title="Overview" /><div className="card"><LoadingState label="Loading overview…" /></div></>;

  // Numbers are grouped by what they describe, so the page reads as three short sections, not fourteen equal boxes.
  const groups = [
    { title: 'People', items: [
      ['Total users', s.userCount], ['Students', s.studentCount ?? 0], ['Teachers', s.teacherCount ?? 0], ['Administrators', s.adminCount],
      ['Online now', s.onlineNow ?? 0], ['Active this week', s.activeUsers7d ?? 0], ['New this week', s.newUsersWeek],
    ] },
    { title: 'Classes', items: [
      ['Live now', s.activeClassrooms], ['Completed', s.completedClassrooms ?? 0], ['All classes', s.classroomCount], ['Captions sent', s.captionCount],
    ] },
    { title: 'Practice', items: [
      ['Sessions', s.sessionCount], ['Last 24 hours', s.sessionsToday], ['Average accuracy', `${s.avgAccuracy}%`], ['Languages', s.languageCount],
    ] },
  ];
  const attention = s.services ? [
    !s.services.email.configured && 'Email is not configured, so login codes and password reset links cannot be sent. Set BREVO_API_KEY and a verified EMAIL_FROM on the server.',
    !s.services.ai.configured && 'AI notes and Q&A are using basic fallbacks (no AI key configured).',
  ].filter(Boolean) : [];
  const max = Math.max(1, ...s.sessionsByLanguage.map((l) => l.count));

  return (
    <>
      <PageHeader title="Overview" subtitle="How the platform is being used, and what needs attention." />

      {attention.length > 0 && (
        <div className="notice notice-warn" role="status" style={{ marginBottom: 'var(--gap)' }}>
          <b>Needs attention</b>
          <ul>{attention.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}

      <div className="overview-groups">
        {groups.map((g) => (
          <section key={g.title} className="card" aria-labelledby={`og-${g.title}`}>
            <h2 id={`og-${g.title}`} className="card-title">{g.title}</h2>
            <dl className="figures">
              {g.items.map(([label, value]) => <div key={label}><dd>{value}</dd><dt>{label}</dt></div>)}
            </dl>
          </section>
        ))}
      </div>

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
