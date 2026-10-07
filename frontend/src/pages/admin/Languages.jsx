import { useCallback, useEffect, useState } from 'react';
import { Globe, Trash2 } from 'lucide-react';
import * as api from '../../api';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, useConfirm } from '../../components/ui';
import { useToast } from '../../context/ToastContext';

export default function Languages() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ code: '', name: '', flag: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoadError('');
    api.admin.languages().then((r) => setList(r.data.languages)).catch((e) => { setLoadError(e.message); setList([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: '' })); };

  const validate = () => {
    const e = {};
    if (!/^[a-z]{2,5}$/i.test(form.code.trim())) e.code = 'Use 2–5 letters, for example “tr”.';
    else if (list?.some((l) => l.code === form.code.trim().toLowerCase())) e.code = 'That code already exists.';
    if (!form.name.trim()) e.name = 'Enter the language name.';
    if (!form.flag.trim()) e.flag = 'Add a flag emoji.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const add = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      await api.admin.addLanguage({ code: form.code.trim().toLowerCase(), name: form.name.trim(), flag: form.flag.trim() });
      setForm({ code: '', name: '', flag: '' });
      toast('Language added', 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  const toggle = async (l) => {
    try { await api.admin.updateLanguage(l.id, { active: !l.active }); load(); }
    catch (err) { toast(err.message, 'error'); }
  };

  const remove = async (l) => {
    const ok = await confirm({ title: `Delete ${l.name}?`, body: 'It is removed from the language list. Existing sessions are not affected.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.admin.deleteLanguage(l.id); toast('Language deleted', 'success'); load(); }
    catch (err) { toast(err.message, 'error'); }
  };

  const field = (id, label, placeholder, extra = {}) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" placeholder={placeholder} value={form[id]} onChange={set(id)} aria-invalid={Boolean(errors[id])} aria-describedby={errors[id] ? `${id}-err` : undefined} {...extra} />
      {errors[id] && <div id={`${id}-err`} className="error-text" role="alert" style={{ marginBottom: 0 }}>{errors[id]}</div>}
    </div>
  );

  return (
    <>
      <PageHeader icon={Globe} title="Languages" subtitle="Manage the languages available to learners." />
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <form className="card" onSubmit={add} noValidate aria-labelledby="add-h">
          <h2 id="add-h" className="card-title">Add a language</h2>
          {field('code', 'Code', 'e.g. tr', { maxLength: 5 })}
          {field('name', 'Name', 'e.g. Turkish')}
          {field('flag', 'Flag emoji', 'e.g. 🇹🇷')}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add language'}</button>
        </form>

        <section className="card" aria-labelledby="all-h">
          <h2 id="all-h" className="card-title">All languages</h2>
          {list === null ? <LoadingState label="Loading languages…" />
            : loadError ? <ErrorState message={loadError} onRetry={load} />
            : list.length === 0 ? <EmptyState icon={Globe} title="No languages yet">Add the first one with the form.</EmptyState> : (
              <ul className="list-rows">
                {list.map((l) => (
                  <li key={l.id} className="row">
                    <span style={{ fontSize: 26 }} aria-hidden="true">{l.flag}</span>
                    <div style={{ flex: 1 }}><b>{l.name}</b> <span className="mono muted" style={{ fontSize: 12 }}>{l.code}</span></div>
                    <button type="button" role="switch" aria-checked={l.active} aria-label={`${l.name} is ${l.active ? 'visible' : 'hidden'}. Toggle visibility`} className={`switch ${l.active ? 'on' : ''}`} onClick={() => toggle(l)}><i aria-hidden="true" /></button>
                    <StatusBadge status={l.active ? 'ok' : 'off'}>{l.active ? 'Visible' : 'Hidden'}</StatusBadge>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => remove(l)} aria-label={`Delete ${l.name}`}><Trash2 size={16} aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            )}
        </section>
      </div>
    </>
  );
}
