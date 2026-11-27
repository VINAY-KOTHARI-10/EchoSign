// People: find people and see their profile. Admins see everyone and can edit; teachers see the students from their own classes.
import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Check, Copy, Pencil, RefreshCw, Search, Trash2, UserPlus, Users, X } from 'lucide-react';
import * as api from '../../../api';
import Pager from '../../../components/Pager';
import { EmptyState, ErrorState, LoadingState, Modal, PageHeader, StatusBadge, useConfirm } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { ROLE_LABEL, formatDate, formatDuration, langName, roleLabel } from '../../../lib';
import { useLanguages } from '../../../lib/languages';

const ROLES = [['', 'Everyone'], ['USER', 'Members'], ['TEACHER', 'Teachers'], ['ADMIN', 'Admins']];
const ACTIVITY = [['', 'Any time'], ['7', 'Active this week'], ['30', 'Active this month'], ['inactive', 'Inactive 30+ days']];
const SORTS = [['name', 'Name (A to Z)'], ['recent', 'Recently active'], ['accuracy', 'Highest accuracy'], ['sessions', 'Most sessions'], ['joined', 'Newest members']];
const tone = (n) => (n >= 80 ? 'ok' : n >= 60 ? 'warn' : 'error');

// "Today", "Yesterday", "5 days ago", "3 weeks ago", otherwise the date.
function since(date) {
  if (!date) return 'Never';
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return formatDate(date);
}

const Avatar = ({ name, size = 40 }) => <span className="people-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">{(name || '?')[0].toUpperCase()}</span>;

function Chips({ codes, max = 3 }) {
  if (!codes?.length) return <span className="muted">None yet</span>;
  return (
    <span className="pill-group" style={{ gap: 6 }}>
      {codes.slice(0, max).map((c) => <span key={c} className="chip">{langName(c)}</span>)}
      {codes.length > max && <span className="chip">+{codes.length - max}</span>}
    </span>
  );
}

// ── one person's profile ───────────────────────────────────────────────────
const ROLE_NOTE = {
  USER: 'A student can join classes, practise and use the community, but cannot start classes.',
  TEACHER: 'A teacher can also start and manage their own classes and see class analytics.',
  ADMIN: 'An admin has full access: every user, role, class, language and the audit log.',
};

function PersonModal({ id, onClose }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { user: me } = useAuth();
  const langs = useLanguages();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['person', id], queryFn: () => api.people.get(id).then((r) => r.data), enabled: Boolean(id) });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setEditing(false); setError(''); }, [id]);

  const d = q.data; const p = d?.person;
  const startEdit = () => { setForm({ username: p.username, bio: p.profile?.bio || '', nativeLanguage: p.profile?.nativeLanguage || 'en', targetLanguages: p.profile?.targetLanguages || [], teachingLanguages: p.profile?.teachingLanguages || [] }); setError(''); setEditing(true); };
  const toggleTeach = (c) => setForm((f) => ({ ...f, teachingLanguages: f.teachingLanguages.includes(c) ? f.teachingLanguages.filter((x) => x !== c) : [...f.teachingLanguages, c] }));
  const refreshAll = async () => { await queryClient.invalidateQueries({ queryKey: ['person', id] }); queryClient.invalidateQueries({ queryKey: ['people'] }); };
  const isAdmin = me?.role === 'ADMIN';
  const changeRole = async (newRole) => {
    if (newRole === p.role) return;
    const ok = await confirm({
      title: `Change ${p.username} to ${ROLE_LABEL[newRole]}?`,
      body: `${p.username} is currently ${ROLE_LABEL[p.role]}. ${ROLE_NOTE[newRole]} The change applies immediately, including to their open sessions, and is written to the audit log.`,
      confirmLabel: `Make ${ROLE_LABEL[newRole]}`,
      danger: newRole === 'ADMIN' || p.role === 'ADMIN' || (p.role === 'TEACHER' && newRole === 'USER'),
    });
    if (!ok) return;
    try { await api.admin.setRole(p.id, newRole); toast(`${p.username} is now ${ROLE_LABEL[newRole]}`, 'success'); await refreshAll(); }
    catch (err) { toast(err.message, 'error'); }
  };
  const removeUser = async () => {
    const ok = await confirm({ title: `Delete ${p.username}?`, body: 'Their sessions, messages and hosted classes are removed permanently. This cannot be undone.', confirmLabel: 'Delete user', danger: true });
    if (!ok) return;
    const done = () => { toast('User deleted', 'success'); queryClient.invalidateQueries({ queryKey: ['people'] }); onClose(); };
    try { await api.admin.deleteUser(p.id); done(); }
    catch (err) {
      if (err.status === 409) {
        const sure = await confirm({ title: `Delete ${p.username} and their classes?`, body: err.message, confirmLabel: 'Delete everything', danger: true });
        if (!sure) return;
        try { await api.admin.deleteUser(p.id, true); done(); } catch (e2) { toast(e2.message, 'error'); }
        return;
      }
      toast(err.message, 'error');
    }
  };
  const toggleLang = (c) => setForm((f) => ({ ...f, targetLanguages: f.targetLanguages.includes(c) ? f.targetLanguages.filter((x) => x !== c) : [...f.targetLanguages, c] }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await api.people.update(id, form);
      toast('Profile saved', 'success');
      await queryClient.invalidateQueries({ queryKey: ['person', id] });
      queryClient.invalidateQueries({ queryKey: ['people'] });
      setEditing(false);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={Boolean(id)} onClose={onClose} title="Profile" wide>
      {q.isPending ? <LoadingState label="Loading profile…" />
        : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : (
          <div className="person">
            <div className="person-head">
              <Avatar name={p.username} size={56} />
              <div>
                <h3>{p.username} <StatusBadge status="info">{roleLabel(p.role)}</StatusBadge></h3>
                <p className="muted">
                  {p.email ? <>{p.email} {p.emailVerified ? <StatusBadge status="ok">Verified</StatusBadge> : <StatusBadge status="warn">Not verified</StatusBadge>} · </> : null}
                  Member since {formatDate(p.createdAt)} · Last active {since(p.profile?.lastActiveAt)}
                </p>
              </div>
              {d.canEdit && !editing && <button type="button" className="btn btn-outline btn-sm person-edit" onClick={startEdit}><Pencil size={15} aria-hidden="true" /> Edit profile</button>}
            </div>

            {editing ? (
              <form className="person-form" onSubmit={save}>
                {error && <div className="error-text" role="alert">{error}</div>}
                <div className="field"><label htmlFor="pe-name">Username</label><input id="pe-name" className="input" value={form.username} maxLength={20} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
                <div className="field"><label htmlFor="pe-bio">About</label><textarea id="pe-bio" className="input" rows={3} maxLength={200} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /><span className="muted" style={{ fontSize: 12 }}>{form.bio.length}/200</span></div>
                <div className="field"><label htmlFor="pe-native">Native language</label>
                  <select id="pe-native" className="select" value={form.nativeLanguage} onChange={(e) => setForm({ ...form, nativeLanguage: e.target.value })}>{langs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></div>
                <fieldset className="fieldset field"><legend className="field-label">Languages being learned</legend>
                  <div className="pill-group">{langs.map((l) => <button type="button" key={l.code} className={`pill ${form.targetLanguages.includes(l.code) ? 'on' : ''}`} aria-pressed={form.targetLanguages.includes(l.code)} onClick={() => toggleLang(l.code)}>{l.name}</button>)}</div></fieldset>
                {['TEACHER', 'ADMIN'].includes(p.role) && (
                  <fieldset className="fieldset field"><legend className="field-label">Languages taught</legend>
                    <div className="pill-group">{langs.map((l) => <button type="button" key={l.code} className={`pill ${form.teachingLanguages.includes(l.code) ? 'on' : ''}`} aria-pressed={form.teachingLanguages.includes(l.code)} onClick={() => toggleTeach(l.code)}>{l.name}</button>)}</div></fieldset>
                )}
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                {p.profile?.bio && <p className="person-bio">{p.profile.bio}</p>}
                <ul className="person-stats plain-grid" aria-label="Practice figures">
                  <li><b>{p.profile?.totalSessions ?? 0}</b><span>Sessions</span></li>
                  <li><b>{p.profile?.avgAccuracy ?? 0}%</b><span>Average accuracy</span></li>
                  <li><b>{p.profile?.totalMinutes ?? 0} min</b><span>Practice time</span></li>
                  <li><b>{p.profile?.streak ?? 0} days</b><span>Current streak</span></li>
                </ul>
                <dl className="kv">
                  <dt>Native language</dt><dd>{langName(p.profile?.nativeLanguage || 'en')}</dd>
                  <dt>Learning</dt><dd><Chips codes={p.profile?.targetLanguages} max={8} /></dd>
                  {['TEACHER', 'ADMIN'].includes(p.role) && <><dt>Teaches</dt><dd><Chips codes={p.profile?.teachingLanguages} max={8} /></dd></>}
                  {d.hostedClasses !== null && <><dt>Classes hosted</dt><dd>{d.hostedClasses}</dd></>}
                </dl>

                {isAdmin && p.id !== me.id && (
                  <>
                    <h4 className="person-h">Account</h4>
                    <div className="row between wrap" style={{ gap: 12 }}>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label htmlFor="pe-role" className="sr-only">Role</label>
                        <select id="pe-role" className="select" value={p.role} onChange={(e) => changeRole(e.target.value)} style={{ width: 'auto' }}>
                          {['USER', 'TEACHER', 'ADMIN'].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </select>
                      </div>
                      <button type="button" className="btn btn-outline btn-sm" onClick={removeUser}><Trash2 size={15} aria-hidden="true" /> Delete account</button>
                    </div>
                  </>
                )}

                <h4 className="person-h">Classes</h4>
                {d.classes.length === 0 ? <p className="muted">No classes joined yet.</p> : (
                  <ul className="person-list plain-grid">
                    {d.classes.map((c) => <li key={c.code}><b>{c.title}</b><span className="muted">{c.code} · joined {c.joins} time{c.joins === 1 ? '' : 's'} · {c.minutes} min · last seen {since(c.lastSeenAt)}</span></li>)}
                  </ul>
                )}

                <h4 className="person-h">Recent practice</h4>
                {d.recentSessions.length === 0 ? <p className="muted">No practice sessions yet.</p> : (
                  <ul className="person-list plain-grid">
                    {d.recentSessions.map((s) => <li key={s.id}><b>{langName(s.language)}</b><span className="muted">{formatDate(s.createdAt)} · {formatDuration(s.duration)}</span><StatusBadge status={tone(s.accuracy)}>{Math.round(s.accuracy)}%</StatusBadge></li>)}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
    </Modal>
  );
}

// ── add a user (admin) ─────────────────────────────────────────────────────
// A first password that meets the rules: 12 characters, letters and numbers, no look-alikes.
const makePassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  const pw = Array.from(bytes, (b) => chars[b % chars.length]).join('');
  return /[A-Za-z]/.test(pw) && /\d/.test(pw) ? pw : makePassword();
};

function AddUserModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const langs = useLanguages();
  const queryClient = useQueryClient();
  const blank = () => ({ username: '', email: '', role: 'USER', nativeLanguage: 'en', password: makePassword() });
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [made, setMade] = useState(null);    // the account that was just created, with the first password to hand over
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (open) { setForm(blank()); setError(''); setMade(null); setCopied(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const res = await api.people.create(form);
      setMade({ person: res.data.person, password: form.password });
      queryClient.invalidateQueries({ queryKey: ['people'] });
      toast('Account created', 'success');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    const text = `EchoSign sign-in\nEmail: ${made.person.email}\nPassword: ${made.password}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { toast('Could not copy. Select the text instead.', 'error'); }
  };

  return (
    <Modal open={open} onClose={onClose} title={made ? 'Account created' : 'Add a user'} wide>
      {made ? (
        <div className="person-form" style={{ marginTop: 12 }}>
          <p><b>{made.person.username}</b> can sign in now as a <b>{roleLabel(made.person.role)}</b>. Share these details with them. This is the only time the password is shown, and they can change it after signing in.</p>
          <dl className="kv"><dt>Email</dt><dd>{made.person.email}</dd><dt>Password</dt><dd className="mono">{made.password}</dd></dl>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={copy}>{copied ? <><Check size={16} aria-hidden="true" /> Copied</> : <><Copy size={16} aria-hidden="true" /> Copy sign-in details</>}</button>
            <button type="button" className="btn btn-outline" onClick={() => { onClose(); onCreated(made.person.id); }}>Open profile</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setMade(null); setForm(blank()); }}>Add another</button>
          </div>
        </div>
      ) : (
        <form className="person-form" onSubmit={submit} style={{ marginTop: 12 }}>
          {error && <div className="error-text" role="alert">{error}</div>}
          <div className="grid grid-2" style={{ gap: 14 }}>
            <div className="field"><label htmlFor="au-name">Username</label><input id="au-name" className="input" value={form.username} maxLength={20} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></div>
            <div className="field"><label htmlFor="au-email">Email</label><input id="au-email" className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="off" /></div>
            <div className="field"><label htmlFor="au-role">Role</label>
              <select id="au-role" className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="USER">Member (student)</option><option value="TEACHER">Teacher</option><option value="ADMIN">Administrator</option></select></div>
            <div className="field"><label htmlFor="au-lang">Native language</label>
              <select id="au-lang" className="select" value={form.nativeLanguage} onChange={(e) => setForm({ ...form, nativeLanguage: e.target.value })}>{langs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></div>
          </div>
          <div className="field">
            <label htmlFor="au-pw">First password</label>
            <div className="row" style={{ gap: 8 }}>
              <input id="au-pw" className="input mono" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="off" style={{ flex: 1 }} />
              <button type="button" className="btn btn-outline" onClick={() => setForm({ ...form, password: makePassword() })}><RefreshCw size={15} aria-hidden="true" /> Generate</button>
            </div>
            <span className="muted" style={{ fontSize: 12 }}>At least 8 characters with a letter and a number. You will see it once more after the account is created.</span>
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>The email is marked as verified, so the person can sign in straight away. {form.role === 'ADMIN' && <b>An administrator can see and change everything.</b>}</p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" disabled={busy || !form.username.trim() || !form.email.trim()}>{busy ? 'Creating…' : 'Create account'}</button>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ── the directory ──────────────────────────────────────────────────────────
export default function People() {
  const { isAdmin } = useAuth();
  const langs = useLanguages();
  const [params, setParams] = useSearchParams();
  const get = (k, d = '') => params.get(k) || d;
  const page = Math.max(1, parseInt(get('page', '1'), 10) || 1);
  const [text, setText] = useState(get('q'));
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(isAdmin && params.get('add') === '1');

  const set = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries({ page: '', ...patch }).forEach(([k, v]) => { if (v) next.set(k, v); else next.delete(k); });
    setParams(next, { replace: true });
  };
  // the search box waits for a pause in typing before asking the server
  useEffect(() => { const t = setTimeout(() => { if (text.trim() !== get('q')) set({ q: text.trim() }); }, 350); return () => clearTimeout(t); }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = { q: get('q'), role: isAdmin ? get('role') : '', language: get('language'), activity: get('activity'), verified: isAdmin ? get('verified') : '', sort: get('sort', 'name'), page, limit: 12 };
  const result = useQuery({ queryKey: ['people', query], queryFn: () => api.people.list(query).then((r) => r.data), placeholderData: keepPreviousData });
  const data = result.data;
  const filtered = Boolean(query.q || query.role || query.language || query.activity || query.verified);
  const clear = () => { setText(''); setParams(new URLSearchParams(), { replace: true }); };
  const counts = data?.counts;
  const roleCount = useMemo(() => (r) => (!counts ? null : r === '' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[r] || 0), [counts]);

  return (
    <>
      <PageHeader icon={Users} title="Member directory" subtitle={isAdmin ? 'Everyone on EchoSign. Search, filter, open a profile or add a new account.' : 'The students who have joined your classes.'}
        actions={isAdmin ? <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><UserPlus size={18} aria-hidden="true" /> Add user</button> : undefined} />

      <section className="card people-filters" aria-label="Search and filters">
        <div className="toolbar" style={{ marginBottom: isAdmin ? 12 : 0 }}>
          <div className="search" style={{ maxWidth: 'none', flex: '2 1 220px' }}>
            <Search size={16} aria-hidden="true" />
            <input className="input" type="search" placeholder={isAdmin ? 'Search by name or email' : 'Search by name'} value={text} onChange={(e) => setText(e.target.value)} aria-label="Search people" />
          </div>
          <div className="field" style={{ margin: 0, flex: '1 1 140px' }}><label className="sr-only" htmlFor="pf-lang">Learning language</label>
            <select id="pf-lang" className="select" value={get('language')} onChange={(e) => set({ language: e.target.value })}><option value="">Any language</option>{langs.map((l) => <option key={l.code} value={l.code}>Learning {l.name}</option>)}</select></div>
          <div className="field" style={{ margin: 0, flex: '1 1 150px' }}><label className="sr-only" htmlFor="pf-act">Activity</label>
            <select id="pf-act" className="select" value={get('activity')} onChange={(e) => set({ activity: e.target.value })}>{ACTIVITY.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
          {isAdmin && <div className="field" style={{ margin: 0, flex: '1 1 120px' }}><label className="sr-only" htmlFor="pf-ver">Email</label>
            <select id="pf-ver" className="select" value={get('verified')} onChange={(e) => set({ verified: e.target.value })}><option value="">Any email</option><option value="yes">Email verified</option><option value="no">Not verified</option></select></div>}
          <div className="field" style={{ margin: 0, flex: '1 1 150px' }}><label className="sr-only" htmlFor="pf-sort">Sort by</label>
            <select id="pf-sort" className="select" value={get('sort', 'name')} onChange={(e) => set({ sort: e.target.value === 'name' ? '' : e.target.value })}>{SORTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
        </div>
        {isAdmin && (
          <div className="pill-group" role="group" aria-label="Filter by role">
            {ROLES.map(([v, t]) => <button key={v || 'all'} type="button" className={`pill ${get('role') === v ? 'on' : ''}`} aria-pressed={get('role') === v} onClick={() => set({ role: v })}>{t}{roleCount(v) !== null ? ` · ${roleCount(v)}` : ''}</button>)}
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: 'var(--gap)' }} aria-label="Results" aria-busy={result.isFetching}>
        <div className="row between wrap" style={{ marginBottom: 12 }}>
          <span className="muted" role="status">{data ? `${data.total} ${data.total === 1 ? 'person' : 'people'}${filtered ? ' match' : ''}` : ' '}</span>
          {filtered && <button type="button" className="btn btn-ghost btn-sm" onClick={clear}><X size={14} aria-hidden="true" /> Clear search and filters</button>}
        </div>
        {result.isPending ? <LoadingState label="Loading people…" />
          : result.error ? <ErrorState message={result.error.message} onRetry={() => result.refetch()} />
          : data.people.length === 0 ? (
            <EmptyState icon={Users} title={filtered ? 'No one matches' : isAdmin ? 'No people yet' : 'No students yet'} action={filtered ? <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 14 }} onClick={clear}>Clear search and filters</button> : undefined}>
              {filtered ? 'Try a different name or loosen a filter.' : isAdmin ? 'People appear here once they sign up.' : 'Students appear here after they join one of your classes.'}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table people-table">
                <caption className="sr-only">People</caption>
                <thead><tr><th scope="col">Person</th><th scope="col">Learning</th><th scope="col">Sessions</th><th scope="col">Accuracy</th><th scope="col">Streak</th><th scope="col">Last active</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {data.people.map((u) => (
                    <tr key={u.id}>
                      <th scope="row">
                        <button type="button" className="person-link" onClick={() => setOpen(u.id)} aria-label={`Open ${u.username}'s profile`}>
                          <Avatar name={u.username} />
                          <span><span className="pl-name"><b>{u.username}</b>{(isAdmin || u.role !== 'USER') && <StatusBadge status="info">{roleLabel(u.role)}</StatusBadge>}</span>{u.email && <small>{u.email}</small>}</span>
                        </button>
                      </th>
                      <td><Chips codes={u.profile?.targetLanguages} /></td>
                      <td>{u.profile?.totalSessions ?? 0}</td>
                      <td>{u.profile?.totalSessions ? <StatusBadge status={tone(u.profile.avgAccuracy)}>{u.profile.avgAccuracy}%</StatusBadge> : <span className="muted">—</span>}</td>
                      <td>{u.profile?.streak ?? 0} d</td>
                      <td>{since(u.profile?.lastActiveAt)}</td>
                      <td style={{ textAlign: 'right' }}><button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(u.id)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <Pager page={page} totalPages={data?.totalPages} onChange={(p) => set({ page: p > 1 ? String(p) : '' })} />
      </section>

      <PersonModal id={open} onClose={() => setOpen(null)} />
      {isAdmin && <AddUserModal open={adding} onClose={() => { setAdding(false); if (params.get('add')) set({ add: '' }); }} onCreated={(id) => { setOpen(id); }} />}
    </>
  );
}
