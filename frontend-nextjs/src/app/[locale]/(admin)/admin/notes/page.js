// Administration: ROLE-BASED ACCESS CONTROL. requireRole() sends signed-out people to sign in and shows the 403 page
// (forbidden.js) to signed-in people who are not an Admin. The data comes from the backend's admin API, which checks the
// role again on its side, so the rule is enforced in two places.
import { ErrorState, PageHeader, StatusBadge } from '@/components/ui';
import { backendJson } from '@/lib/backend';
import { listNotes } from '@/features/notes/data';
import { getDictionary } from '@/i18n/get-dictionary';
import { requireRole } from '@/lib/session';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return { title: d.admin.title };
}

export default async function AdminPage({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  const { user, token } = await requireRole(locale, ['ADMIN'], `/${locale}/admin/notes`);
  const [stats, users, notes] = await Promise.all([
    backendJson('/admin/stats', { token }),
    backendJson('/admin/users?limit=5', { token }),
    listNotes({ userId: user.id, all: true }).catch(() => ({ items: [], total: 0 })),
  ]);
  const s = stats.data || {};
  const tiles = [[d.admin.users, s.userCount], [d.admin.classes, s.classroomCount], [d.admin.sessions, s.sessionCount], [d.admin.captions, s.captionCount]];

  return (
    <>
      <PageHeader title={d.admin.title} subtitle={d.admin.subtitle} actions={<StatusBadge status="info">ADMIN</StatusBadge>} />

      {!stats.ok && <div className="card" style={{ marginBottom: 20 }}><ErrorState title={d.common.somethingWrong} message={stats.status === 0 ? d.common.backendDown : stats.error} /></div>}

      <div className="grid-stats" style={{ marginBottom: 24 }}>
        {tiles.map(([label, value]) => (
          <div key={label} className="card stat">
            <span className="num">{value ?? '—'}</span>
            <span className="label">{label}</span>
          </div>
        ))}
      </div>

      <section className="card" aria-labelledby="users-h" style={{ marginBottom: 24 }}>
        <h2 id="users-h" className="card-title">{d.admin.recentUsers}</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>{d.auth.username}</th><th>{d.auth.email}</th><th>{d.admin.role}</th><th>{d.admin.joined}</th></tr>
            </thead>
            <tbody>
              {(users.data?.users ?? []).map((u) => (
                <tr key={u.id}>
                  <td><b>{u.username}</b></td><td>{u.email}</td><td>{u.role}</td>
                  <td>{new Date(u.createdAt).toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" aria-labelledby="all-notes-h">
        <h2 id="all-notes-h" className="card-title">{d.admin.allNotes}: {notes.total}</h2>
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {notes.items.map((n) => (
            <li key={n.id}><b>{n.title}</b> <span className="muted" style={{ fontSize: 12 }}>· {d.notes.owner}: {n.userId.slice(0, 8)}…</span></li>
          ))}
        </ul>
      </section>
    </>
  );
}
