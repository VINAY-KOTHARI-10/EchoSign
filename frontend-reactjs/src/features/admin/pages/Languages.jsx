// Languages: which languages EchoSign offers. Adding one gives learners a language to pick, teachers a language to teach, and
// the Community a room for it. Hiding one removes it from the pickers and hides its room; built-in languages cannot be deleted.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Globe, Plus, Search, Trash2 } from 'lucide-react';
import * as api from '../../../api';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, useConfirm } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';

const FILTERS = [['all', 'All'], ['visible', 'Visible'], ['hidden', 'Hidden']];

export default function Languages() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ code: '', name: '', flag: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoadError('');
    api.admin.languages().then((r) => setList(r.data.languages)).catch((e) => { setLoadError(e.message); setList([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: '' })); };

  const validate = () => {
    const e = {};
    if (!/^[a-z]{2,5}$/i.test(form.code.trim())) e.code = 'Use 2 to 5 letters, for example “tr”.';
    else if (list?.some((l) => l.code === form.code.trim().toLowerCase())) e.code = 'That code already exists.';
    if (form.name.trim().length < 2) e.name = 'Enter the language name.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const add = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      const name = form.name.trim();
      await api.admin.addLanguage({ code: form.code.trim().toLowerCase(), name, flag: (form.flag.trim() || form.code.trim()).toUpperCase().slice(0, 4) });
      setForm({ code: '', name: '', flag: '' });
      toast(`${name} added. It now has its own Community room.`, 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  const toggle = async (l) => {
    try { await api.admin.updateLanguage(l.code, { active: !l.active }); toast(`${l.name} is now ${l.active ? 'hidden' : 'visible'}`, 'success'); load(); }
    catch (err) { toast(err.message, 'error'); }
  };

  const remove = async (l) => {
    const ok = await confirm({
      title: `Delete ${l.name}?`,
      body: `${l.name} is removed from the language lists and its Community room is hidden. ${l.learners || l.teachers ? `It is also taken off ${l.learners} learner${l.learners === 1 ? '' : 's'} and ${l.teachers} teacher${l.teachers === 1 ? '' : 's'}. ` : ''}Practice sessions and classes already recorded keep it.`,
      confirmLabel: 'Delete language', danger: true,
    });
    if (!ok) return;
    try { await api.admin.deleteLanguage(l.code); toast('Language deleted', 'success'); load(); }
    catch (err) { toast(err.message, 'error'); }
  };

  const shown = useMemo(() => (list || []).filter((l) => (filter === 'all' || (filter === 'visible') === l.active) && (!search.trim() || `${l.name} ${l.code}`.toLowerCase().includes(search.trim().toLowerCase()))), [list, filter, search]);
  const visible = (list || []).filter((l) => l.active).length;

  const field = (id, label, placeholder, extra = {}) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" placeholder={placeholder} value={form[id]} onChange={set(id)} aria-invalid={Boolean(errors[id])} aria-describedby={errors[id] ? `${id}-err` : undefined} {...extra} />
      {errors[id] && <div id={`${id}-err`} className="error-text" role="alert" style={{ marginBottom: 0 }}>{errors[id]}</div>}
    </div>
  );

  return (
    <>
      <PageHeader icon={Globe} title="Languages" subtitle={list ? `${visible} of ${list.length} languages are visible to learners, teachers and the Community.` : 'The languages EchoSign offers.'} />
      <div className="lang-layout">
        <section className="card" aria-labelledby="all-h">
          <div className="row between wrap" style={{ marginBottom: 12 }}>
            <h2 id="all-h" className="card-title" style={{ marginBottom: 0 }}>All languages</h2>
            <div className="toolbar" style={{ marginBottom: 0 }}>
              <div className="search" style={{ minWidth: 180 }}><Search size={16} aria-hidden="true" /><input className="input" type="search" placeholder="Search languages" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search languages" /></div>
              <div className="pill-group" role="group" aria-label="Filter languages">{FILTERS.map(([v, t]) => <button key={v} type="button" className={`pill ${filter === v ? 'on' : ''}`} aria-pressed={filter === v} onClick={() => setFilter(v)}>{t}</button>)}</div>
            </div>
          </div>
          {list === null ? <LoadingState label="Loading languages…" />
            : loadError ? <ErrorState message={loadError} onRetry={load} />
            : shown.length === 0 ? <EmptyState icon={Globe} title="No languages match">Try another search or filter.</EmptyState> : (
              <div className="table-wrap">
                <table className="table lang-table">
                  <caption className="sr-only">Languages</caption>
                  <thead><tr><th scope="col">Language</th><th scope="col">Learners</th><th scope="col">Teachers</th><th scope="col">Practice</th><th scope="col">Visible</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {shown.map((l) => (
                      <tr key={l.code} className={l.active ? '' : 'is-off'}>
                        <th scope="row"><span className="lang-name"><span className="chip" aria-hidden="true">{(l.flag || l.code).toUpperCase()}</span><span><b>{l.name}</b><small>{l.code}{l.builtin ? ' · built in' : ' · added by an admin'}</small></span></span></th>
                        <td>{l.learners}</td>
                        <td>{l.teachers}</td>
                        <td>{l.sessions} sessions · {l.classes} classes</td>
                        <td><button type="button" role="switch" aria-checked={l.active} aria-label={`${l.name} is ${l.active ? 'visible' : 'hidden'}. Toggle visibility`} className={`switch ${l.active ? 'on' : ''}`} onClick={() => toggle(l)}><i aria-hidden="true" /></button></td>
                        <td style={{ textAlign: 'right' }}>
                          {l.builtin
                            ? <StatusBadge status="off">Built in</StatusBadge>
                            : <button className="btn btn-ghost btn-sm btn-icon" onClick={() => remove(l)} aria-label={`Delete ${l.name}`}><Trash2 size={16} aria-hidden="true" /></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </section>

        <form className="card" onSubmit={add} noValidate aria-labelledby="add-h">
          <h2 id="add-h" className="card-title">Add a language</h2>
          <p className="muted" style={{ fontSize: 13, margin: '-4px 0 14px' }}>It becomes available to learners, teachers can say they teach it, and the Community gets a room for it straight away.</p>
          {field('code', 'Code', 'e.g. tr', { maxLength: 5 })}
          {field('name', 'Name', 'e.g. Turkish')}
          {field('flag', 'Short label (optional)', 'e.g. TR', { maxLength: 4 })}
          <button className="btn btn-primary btn-block" disabled={busy}><Plus size={17} aria-hidden="true" /> {busy ? 'Adding…' : 'Add language'}</button>
        </form>
      </div>
    </>
  );
}
