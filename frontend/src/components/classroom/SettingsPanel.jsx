import { useState } from 'react';
import * as api from '../../api';
import { useToast } from '../../context/ToastContext';

// local "YYYY-MM-DDTHH:mm" <-> ISO, for <input type="datetime-local">
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

// Host-only class settings: title, highlight keywords, schedule, reopen.
export default function SettingsPanel({ room, setRoom, ended, onReopened }) {
  const toast = useToast();
  const [title, setTitle] = useState(room.title);
  const [keywords, setKeywords] = useState((room.keywords || []).join(', '));
  const [when, setWhen] = useState(toLocalInput(room.scheduledAt));
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.classrooms.update(room.code, {
        title,
        keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
        scheduledAt: when ? new Date(when).toISOString() : null,
      });
      setRoom((r) => ({ ...r, ...res.data.classroom }));
      toast('Class settings saved', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  const reopen = async () => {
    try { await api.classrooms.reopen(room.code); onReopened(); toast('Class reopened — same code and link', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <form className="card" onSubmit={save}>
        <h2 className="card-title">Class settings</h2>
        <div className="field"><label htmlFor="s-title">Title</label>
          <input id="s-title" className="input" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="field"><label htmlFor="s-kw">Key terms to highlight (comma separated)</label>
          <input id="s-kw" className="input" placeholder="photosynthesis, chlorophyll, ATP" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
          <span className="muted" style={{ fontSize: 12 }}>These stand out in every student’s captions and help with checking the transcript.</span></div>
        <div className="field"><label htmlFor="s-when">Scheduled start (optional)</label>
          <input id="s-when" className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
      </form>

      <div className="card">
        <h2 className="card-title">Recurring class</h2>
        <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>
          Keep one code and link for the whole course. When a class ends, reopen it next time instead of creating a new one — the transcript, keywords and class gestures carry over.
        </p>
        {ended ? <button className="btn btn-primary" onClick={reopen}>Reopen this class</button> : <span className="chip chip-go">This class is open</span>}
      </div>
    </div>
  );
}
