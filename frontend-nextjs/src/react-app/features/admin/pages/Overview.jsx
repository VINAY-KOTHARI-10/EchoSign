import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe, LayoutDashboard, Mic, ScrollText, UserPlus, UserSearch, Users } from 'lucide-react';
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

  const attention = s.services ? [
    !s.services.email.configured && 'Email is not configured, so login codes and password reset links cannot be sent. Set BREVO_API_KEY and a verified EMAIL_FROM on the server.',
    !s.services.ai.configured && 'AI notes and Q&A are using basic fallbacks (no AI key configured).',
  ].filter(Boolean) : [];
  const max = Math.max(1, ...s.sessionsByLanguage.map((l) => l.count));
  const tiles = [
    ['Total users', s.userCount, `${s.newUsersWeek} new this week`],
    ['Online now', s.onlineNow ?? 0, `${s.activeUsers7d ?? 0} active this week`],
    ['Live classes', s.activeClassrooms, `${s.classroomCount} classes in total`],
    ['Practice sessions', s.sessionsToday, `in the last 24 hours (${s.sessionCount} in total)`],
  ];
  const actions = [
    { to: '/admin/directory?add=1', icon: UserPlus, label: 'Add a user', hint: 'Create an account with a role' },
    { to: '/admin/directory', icon: UserSearch, label: 'Directory', hint: 'Search people, change roles, edit profiles' },
    { to: '/admin/languages', icon: Globe, label: 'Languages', hint: 'Add, hide or delete a language' },
    { to: '/admin/audit', icon: ScrollText, label: 'Audit log', hint: 'Who changed what, and when' },
  ];

  return (
    <>
      <PageHeader title="Overview" subtitle="How the platform is being used, and what needs attention." />

      {attention.length > 0 && (
        <div className="notice notice-warn" role="status" style={{ marginBottom: 'var(--gap)' }}>
          <b>Needs attention</b>
          <ul>{attention.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}

      <ul className="grid grid-4 plain-grid" style={{ marginBottom: 'var(--gap)' }} aria-label="Key numbers">
        {tiles.map(([label, value, hint]) => (
          <li key={label} className="card stat"><div className="num">{value}</div><div className="label">{label}</div><div className="muted" style={{ fontSize: 12 }}>{hint}</div></li>
        ))}
      </ul>

      <nav className="quick-actions" aria-label="Quick actions">
        {actions.map(({ to, icon: Icon, label, hint }) => (
          <Link key={to} to={to} className="quick-action">
            <span className="qa-icon" aria-hidden="true"><Icon size={20} /></span>
            <span><b>{label}</b><small>{hint}</small></span>
          </Link>
        ))}
      </nav>

      <div className="grid grid-2 overview-cards" style={{ alignItems: 'start' }}>
        <section className="card" aria-labelledby="recent-h">
          <div className="row between"><h2 id="recent-h" className="card-title" style={{ marginBottom: 0 }}>Recent signups</h2><Link to="/admin/directory" className="link" style={{ fontSize: 13 }}>View all users</Link></div>
          {s.recentUsers.length === 0 ? <EmptyState icon={Users} title="No users yet" /> : (
            <ul className="list-rows">
              {s.recentUsers.map((u) => (
                <li key={u.id} className="row">
                  <div className="avatar" style={{ width: 36, height: 36 }} aria-hidden="true">{u.username[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><b>{u.username}</b><div className="muted" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div></div>
                  <StatusBadge status="info">{u.role === 'ADMIN' ? 'Admin' : u.role === 'TEACHER' ? 'Teacher' : 'Member'}</StatusBadge>
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
