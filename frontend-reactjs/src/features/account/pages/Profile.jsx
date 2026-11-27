// Profile - tabbed account, preferences, accessibility, security
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Laptop, Pencil, Smartphone, User } from 'lucide-react';
import * as api from '../../../api';
import { formatDate, roleLabel } from '../../../lib';
import { useLanguages } from '../../../lib/languages';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import useDisplayPrefs, { FONTS, THEMES } from '../../../hooks/useDisplayPrefs';
import { useUiPrefs } from '../../../hooks/useUiPrefs';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, TabPanel, Tabs, useConfirm } from '../../../components/ui';

const TABS = [{ id: 'account', label: 'Account' }, { id: 'prefs', label: 'Preferences' }, { id: 'a11y', label: 'Accessibility' }, { id: 'security', label: 'Security' }];

// "Chrome on Windows" from a user-agent string; good enough to recognise your own devices.
const describeDevice = (ua = '') => {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown device';
  return { label: `${browser} on ${os}`, mobile: /Android|iPhone|iPad/.test(ua) };
};

function Toggle({ id, checked, onChange, label, hint }) {
  return (
    <div className="toggle-row">
      <div><label htmlFor={id} className="field-label">{label}</label><div className="hint" id={`${id}-hint`}>{hint}</div></div>
      <button id={id} type="button" role="switch" aria-checked={checked} aria-describedby={`${id}-hint`} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
        <span className="sr-only">{checked ? 'On' : 'Off'}</span><i aria-hidden="true" />
      </button>
    </div>
  );
}

function Security() {
  const { logout } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');

  const load = () => { setError(''); api.auth.sessions().then((r) => setSessions(r.data.sessions || [])).catch((e) => { setError(e.message); setSessions([]); }); };
  useEffect(load, []);

  const signOutAll = async () => {
    const ok = await confirm({ title: 'Sign out everywhere?', body: 'You will be signed out on every device, including this one, and will need to sign in again.', confirmLabel: 'Sign out everywhere', danger: true });
    if (!ok) return;
    try { await api.auth.logoutAll(); await logout(); toast('Signed out of all devices', 'success'); navigate('/'); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <section className="card" aria-labelledby="sec-h">
      <div className="row between wrap" style={{ marginBottom: 6 }}>
        <h2 id="sec-h" className="card-title" style={{ marginBottom: 0 }}>Where you’re signed in</h2>
        <button className="btn btn-danger-soft btn-sm" onClick={signOutAll}>Sign out of all devices</button>
      </div>
      <p className="muted" style={{ fontSize: 14, marginBottom: 8 }}>These devices have an active session. If you don’t recognise one, sign out everywhere.</p>
      {sessions === null ? <LoadingState label="Loading sessions…" />
        : error ? <ErrorState message={error} onRetry={load} />
        : sessions.length === 0 ? <EmptyState icon={Laptop} title="No active sessions found" />
        : (
          <ul className="session-list">
            {sessions.map((s, i) => {
              const d = describeDevice(s.userAgent);
              const Icon = d.mobile ? Smartphone : Laptop;
              return (
                <li key={s._id || i}>
                  <span className="session-icon" aria-hidden="true"><Icon size={20} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{d.label}</b>
                    <div className="muted" style={{ fontSize: 13 }}>{s.provider === 'google' ? 'Google sign-in' : 'Email sign-in'} · last active {new Date(s.lastUsedAt || s.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>
                  </div>
                  {i === 0 && <StatusBadge status="ok">Most recent</StatusBadge>}
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}

export default function Profile() {
  const langs = useLanguages();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('account');
  const [native, setNative] = useState(user.profile?.nativeLanguage || 'en');
  const [targets, setTargets] = useState(user.profile?.targetLanguages || []);
  const [teaching, setTeaching] = useState(user.profile?.teachingLanguages || []);
  const canTeach = user.role === 'TEACHER' || user.role === 'ADMIN';
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);          // the account details are being edited
  const [form, setForm] = useState({ username: '', bio: '' });
  const [formError, setFormError] = useState('');
  const [prefs, updatePrefs, resetPrefs] = useDisplayPrefs();
  const { ui, setUi } = useUiPrefs();
  const theme = THEMES.find((t) => t.id === prefs.theme) || THEMES[0];
  const profile = user.profile;

  const toggle = (code) => setTargets((t) => (t.includes(code) ? t.filter((c) => c !== code) : [...t, code]));
  const toggleTeach = (code) => setTeaching((t) => (t.includes(code) ? t.filter((c) => c !== code) : [...t, code]));

  const startEdit = () => { setForm({ username: user.username, bio: user.profile?.bio || '' }); setFormError(''); setEditing(true); };
  // Every role can change their own username and about-me. A taken username comes back as a message under the field.
  const saveDetails = async (e) => {
    e.preventDefault();
    setBusy(true); setFormError('');
    try {
      await api.users.updateProfile({ username: form.username, bio: form.bio });
      await refresh();
      setEditing(false);
      toast('Profile updated', 'success');
    } catch (err) { setFormError(err.message); }
    finally { setBusy(false); }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.users.updateProfile({ nativeLanguage: native, targetLanguages: targets, ...(canTeach && { teachingLanguages: teaching }) });
      await refresh();
      toast('Language preferences saved', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader icon={User} title="My Profile" subtitle="Manage your account and accessibility preferences." />

      <section className="profile-head card" aria-label="Your profile summary" style={{ marginBottom: 'var(--section-gap)' }}>
        <div className="who">
          <div className="avatar" aria-hidden="true">{user.username[0].toUpperCase()}</div>
          <div>
            <h2 style={{ fontSize: 22 }}>{user.username} <StatusBadge status="info">{roleLabel(user.role)}</StatusBadge></h2>
            <div className="muted">{user.email}</div>
            {profile?.bio && <p className="profile-bio">{profile.bio}</p>}
          </div>
        </div>
        <ul className="mini-stats plain-grid" aria-label="Your numbers">
          <li className="mini-stat"><b>{profile?.totalSessions ?? 0}</b><span>Sessions</span></li>
          <li className="mini-stat"><b>{Math.round(profile?.avgAccuracy ?? 0)}%</b><span>Accuracy</span></li>
          <li className="mini-stat"><b>{profile?.streak ?? 0} days</b><span>Streak</span></li>
        </ul>
      </section>

      <Tabs variant="pill" tabs={TABS} value={tab} onChange={setTab} label="Profile sections" idPrefix="prof" />

      <TabPanel id="account" active={tab === 'account'} idPrefix="prof">
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <section className="card" aria-labelledby="acct-h">
            <div className="row between"><h2 id="acct-h" className="card-title" style={{ marginBottom: 0 }}>Account details</h2>
              {!editing && <button type="button" className="btn btn-outline btn-sm" onClick={startEdit}><Pencil size={15} aria-hidden="true" /> Edit</button>}</div>
            {editing ? (
              <form onSubmit={saveDetails} style={{ marginTop: 14 }}>
                {formError && <div className="error-text" role="alert">{formError}</div>}
                <div className="field">
                  <label htmlFor="pf-username">Username</label>
                  <input id="pf-username" className="input" value={form.username} maxLength={20} onChange={(e) => setForm({ ...form, username: e.target.value })} aria-invalid={Boolean(formError)} autoComplete="username" />
                </div>
                <div className="field">
                  <label htmlFor="pf-bio">About me <span className="muted">(optional)</span></label>
                  <textarea id="pf-bio" className="input" rows={3} maxLength={200} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="A line or two about you: what you teach or what you are learning." />
                  <span className="muted" style={{ fontSize: 12 }}>{form.bio.length}/200</span>
                </div>
                <p className="muted" style={{ fontSize: 13, margin: '0 0 14px' }}>Your email is your sign-in and cannot be changed here.</p>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-primary" disabled={busy || form.username.trim().length < 3}>{busy ? 'Saving…' : 'Save changes'}</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
                </div>
              </form>
            ) : (
              <dl className="kv" style={{ marginTop: 12 }}>
                <dt>Username</dt><dd>{user.username}</dd>
                <dt>About me</dt><dd>{profile?.bio || <span className="muted">Nothing added yet</span>}</dd>
                <dt>Email</dt><dd>{user.email} {user.emailVerified ? <StatusBadge status="ok">Verified</StatusBadge> : <StatusBadge status="warn">Not verified</StatusBadge>}</dd>
                <dt>Role</dt><dd>{roleLabel(user.role)}</dd>
                <dt>Member since</dt><dd>{formatDate(user.createdAt)}</dd>
              </dl>
            )}
          </section>
          <section className="card" aria-labelledby="learn-h">
            <h2 id="learn-h" className="card-title">Languages</h2>
            <dl className="kv">
              <dt>Native language</dt><dd>{langs.find((l) => l.code === (profile?.nativeLanguage || 'en'))?.name || profile?.nativeLanguage || 'English'}</dd>
              <dt>Learning</dt>
              <dd>{(profile?.targetLanguages || []).length
                ? <span className="pill-group">{profile.targetLanguages.map((c) => <span key={c} className="chip">{langs.find((l) => l.code === c)?.name || c}</span>)}</span>
                : <span className="muted">None chosen yet</span>}</dd>
              {canTeach && <><dt>Teaching</dt><dd>{(profile?.teachingLanguages || []).length
                ? <span className="pill-group">{profile.teachingLanguages.map((c) => <span key={c} className="chip">{langs.find((l) => l.code === c)?.name || c}</span>)}</span>
                : <span className="muted">None chosen yet</span>}</dd></>}
            </dl>
            <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 14 }} onClick={() => setTab('prefs')}>Change language preferences</button>
          </section>
        </div>
      </TabPanel>

      <TabPanel id="prefs" active={tab === 'prefs'} idPrefix="prof">
        <form className="card" onSubmit={save} aria-labelledby="lang-h" style={{ maxWidth: 760 }}>
          <h2 id="lang-h" className="card-title">Language preferences</h2>
          <p className="muted" style={{ marginTop: -4, marginBottom: 14, fontSize: 14 }}>Your native language is used to translate captions when a class is taught in another language. The languages you are learning set the starting language in Practice and AI Partner.</p>
          <div className="field">
            <label htmlFor="native">Native language</label>
            <select id="native" className="select" value={native} onChange={(e) => setNative(e.target.value)}>
              {langs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </div>
          <fieldset className="fieldset field">
            <legend className="field-label">Languages I’m learning</legend>
            <div className="pill-group">
              {langs.map((l) => <button type="button" key={l.code} className={`pill ${targets.includes(l.code) ? 'on' : ''}`} aria-pressed={targets.includes(l.code)} onClick={() => toggle(l.code)}>{l.name}</button>)}
            </div>
          </fieldset>
          {canTeach && (
            <fieldset className="fieldset field">
              <legend className="field-label">Languages I teach</legend>
              <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>Learners see you as a teacher in each language’s Community room and in the Directory.</p>
              <div className="pill-group">
                {langs.map((l) => <button type="button" key={l.code} className={`pill ${teaching.includes(l.code) ? 'on' : ''}`} aria-pressed={teaching.includes(l.code)} onClick={() => toggleTeach(l.code)}>{l.name}</button>)}
              </div>
            </fieldset>
          )}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save language preferences'}</button>
        </form>
      </TabPanel>

      <TabPanel id="a11y" active={tab === 'a11y'} idPrefix="prof">
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <section className="card" aria-labelledby="a11y-h">
            <div className="row between"><h2 id="a11y-h" className="card-title" style={{ marginBottom: 0 }}>Display</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => { resetPrefs(); setUi({ highContrast: false, reduceMotion: false, theme: 'system', announceCaptions: false }); }}>Reset all</button></div>
            <p className="muted" style={{ fontSize: 13, margin: '6px 0 16px' }}>Saved on this device and applied across the whole app.</p>

            <fieldset className="fieldset field">
              <legend className="field-label">Appearance</legend>
              <div className="pill-group" role="radiogroup" aria-label="Appearance">
                {[['system', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']].map(([id, label]) => <button type="button" key={id} role="radio" aria-checked={ui.theme === id} className={`pill ${ui.theme === id ? 'on' : ''}`} onClick={() => setUi({ theme: id })}>{label}</button>)}
              </div>
            </fieldset>

            <Toggle id="hc" checked={ui.highContrast} onChange={(v) => setUi({ highContrast: v })} label="High contrast" hint="Stronger colours and borders across the interface." />
            <Toggle id="rm" checked={ui.reduceMotion} onChange={(v) => setUi({ reduceMotion: v })} label="Reduce motion" hint="Turns off animations. Also follows your system setting automatically." />
            <Toggle id="ann" checked={ui.announceCaptions} onChange={(v) => setUi({ announceCaptions: v })} label="Read new captions to my screen reader" hint="Announces each caption from other people in a class, politely, without moving focus. Turn off if it is too chatty." />
          </section>

          <section className="card" aria-labelledby="cap-h">
            <h2 id="cap-h" className="card-title">Captions</h2>
            <p className="muted" style={{ fontSize: 13, margin: '-4px 0 16px' }}>How captions look in a class. More options are in each class.</p>
            <div className="field">
              <label htmlFor="cc-size">Text size: <b>{prefs.size}px</b></label>
              <input id="cc-size" type="range" min={18} max={72} value={prefs.size} onChange={(e) => updatePrefs({ size: Number(e.target.value) })} style={{ width: '100%', accentColor: 'var(--violet)' }} />
            </div>
            <div className="field">
              <label htmlFor="cc-font">Font</label>
              <select id="cc-font" className="select" value={prefs.font} onChange={(e) => updatePrefs({ font: e.target.value })}>
                {Object.entries(FONTS).map(([id, f]) => <option key={id} value={id}>{f.label}</option>)}
              </select>
            </div>
            <fieldset className="fieldset field">
              <legend className="field-label">Colours</legend>
              <div className="pill-group" role="radiogroup" aria-label="Caption colours">
                {THEMES.map((t) => <button type="button" key={t.id} role="radio" aria-checked={prefs.theme === t.id} className={`pill ${prefs.theme === t.id ? 'on' : ''}`} onClick={() => updatePrefs({ theme: t.id })}>{t.label}</button>)}
              </div>
            </fieldset>

            <div className="field-label" id="preview-label">Preview</div>
            <div className="caption-preview" aria-labelledby="preview-label" style={{ background: theme.bg, color: theme.fg, fontSize: prefs.size, fontFamily: FONTS[prefs.font]?.css, lineHeight: prefs.lineHeight, letterSpacing: `${prefs.letterSpacing}em` }}>
              An object in motion stays in motion.
            </div>
          </section>
        </div>
      </TabPanel>

      <TabPanel id="security" active={tab === 'security'} idPrefix="prof">
        <div style={{ maxWidth: 760 }}><Security /></div>
      </TabPanel>
    </>
  );
}

