import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Trash2, Upload } from 'lucide-react';

import SignView from './SignView';
import { StatusBadge, useConfirm } from './ui';
import useSignRecognition from '../hooks/useSignRecognition';
import { evaluate, repredict, toMarkdown } from '../lib/evaluation';
import { WINDOW_FRAMES } from '../lib/recognition';
import { useToast } from '../context/ToastContext';

const STORE = 'echosign_sign_samples';
const TARGETS = 'ABCDEFGHIKLMNOPQRSTUVWXY'.split(''); // J and Z need motion, tested separately
const OPTIONS = {
  lighting: ['bright indoor', 'dim indoor', 'daylight window', 'backlit'],
  camera: ['laptop webcam', 'phone', 'external webcam'],
  background: ['plain', 'busy'],
  distance: ['near (30 cm)', 'arm\'s length', 'far (1 m)'],
  orientation: ['palm to camera', 'angled', 'sideways'],
};

const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; } };
const save = (list) => { try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch { return false; } };
const flat = (points) => points.flatMap((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);
const pct = (v) => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(0)}%`);
const download = (name, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
};

// A repeatable way to measure how well the recogniser works with REAL people and cameras. Samples are landmark numbers
// only (no video, no images), kept in this browser until the person exports them, and only recorded with consent.
export default function RecognitionLab() {
  const toast = useToast();
  const confirm = useConfirm();
  const sign = useSignRecognition({ mode: 'letters' });
  const [samples, setSamples] = useState(load);
  const [consent, setConsent] = useState(false);
  const [target, setTarget] = useState('A');
  const [meta, setMeta] = useState({ signer: '', lighting: OPTIONS.lighting[0], camera: OPTIONS.camera[0], background: OPTIONS.background[0], distance: OPTIONS.distance[1], orientation: OPTIONS.orientation[0] });
  const [recording, setRecording] = useState(false);
  const [rescored, setRescored] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { if (!save(samples)) toast('This browser has no room left to keep samples. Export them now.', 'error'); }, [samples, toast]);

  // Record about one second of consecutive frames, then score them exactly as the live recogniser would.
  const record = async () => {
    if (!consent) return toast('Tick the consent box first', 'error');
    if (!meta.signer.trim()) return toast('Enter an anonymous label for the signer, like P1', 'error');
    if (sign.status !== 'running') return toast('Start the camera first', 'error');
    setRecording(true);
    const frames = [];
    const started = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const pts = sign.pointsRef.current;
        if (pts) frames.push(flat(pts));
        if (performance.now() - started < 1400 && frames.length < 60) requestAnimationFrame(tick); else resolve();
      };
      tick();
    });
    setRecording(false);
    if (frames.length < WINDOW_FRAMES) return toast(`Only ${frames.length} frames had a visible hand. Keep your hand in view and try again.`, 'error');
    const sample = { id: crypto.randomUUID(), consent: true, label: target, meta: { ...meta, signer: meta.signer.trim() }, frames: frames.slice(-WINDOW_FRAMES), takenAt: new Date().toISOString() };
    setSamples((list) => [...list, { ...sample, ...repredict(sample) }]);
  };

  const shown = useMemo(() => (rescored ? samples.map((s) => ({ ...s, ...repredict(s) })) : samples), [samples, rescored]);
  const report = useMemo(() => evaluate(shown), [shown]);

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list = (data.samples || data).filter((s) => s && s.label && s.consent !== false);
      setSamples((cur) => { const have = new Set(cur.map((s) => s.id)); return [...cur, ...list.filter((s) => !have.has(s.id))]; });
      toast(`Imported ${list.length} samples`, 'success');
    } catch { toast('That file is not a samples export', 'error'); }
  };

  const clearAll = async () => {
    if (await confirm({ title: 'Delete all recorded samples?', body: 'They are only stored in this browser. Export them first if you want to keep them.', confirmLabel: 'Delete', danger: true })) setSamples([]);
  };

  const confusionCols = [...new Set([...report.labels, ...Object.values(report.matrix).flatMap((r) => Object.keys(r))])].filter((c) => c !== 'rejected').sort();
  return (
    <div className="lab-layout">
      <div className="stack">
        <section className="card" aria-labelledby="rl-h">
          <h2 id="rl-h" className="card-title">Recognition test</h2>
          <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>
            Measure how well fingerspelling recognition works with real people and cameras. Each sample is about a second of hand-landmark numbers. No video or pictures are saved or uploaded, and nothing leaves this device unless you export it.
          </p>
          <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I (the person signing) agree to save these hand-landmark samples in this browser and to export them for testing.</label>

          <div className="grid grid-2" style={{ marginTop: 12 }}>
            <div className="field"><label htmlFor="rl-signer">Signer label (anonymous, like P1)</label><input id="rl-signer" className="input" value={meta.signer} maxLength={20} onChange={(e) => setMeta((m) => ({ ...m, signer: e.target.value }))} /></div>
            <div className="field"><label htmlFor="rl-target">Letter to sign</label>
              <select id="rl-target" className="select" value={target} onChange={(e) => setTarget(e.target.value)}>{TARGETS.map((l) => <option key={l}>{l}</option>)}</select></div>
            {Object.entries(OPTIONS).map(([key, opts]) => (
              <div className="field" key={key}><label htmlFor={`rl-${key}`}>{key[0].toUpperCase() + key.slice(1)}</label>
                <select id={`rl-${key}`} className="select" value={meta[key]} onChange={(e) => setMeta((m) => ({ ...m, [key]: e.target.value }))}>{opts.map((o) => <option key={o}>{o}</option>)}</select></div>
            ))}
          </div>
          <button className="btn btn-primary btn-block" disabled={recording || sign.status !== 'running'} onClick={record}>{recording ? 'Recording… hold the letter' : `Record sample for “${target}”`}</button>
        </section>

        <section className="card" aria-labelledby="rs-h">
          <div className="row between wrap" style={{ marginBottom: 10 }}>
            <h2 id="rs-h" className="card-title" style={{ marginBottom: 0 }}>Results from {report.total} {report.total === 1 ? 'sample' : 'samples'}</h2>
            <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={rescored} onChange={(e) => setRescored(e.target.checked)} /> Re-score with the current recogniser</label>
          </div>
          {report.total === 0 ? <p className="muted">Record samples to see accuracy, precision, recall and a confusion matrix. Nothing is shown until there is real data.</p> : (
            <>
              <ul className="sign-readout plain-grid" style={{ margin: '0 0 12px' }} aria-label="Summary">
                <li><dl><dt>Accuracy</dt><dd>{pct(report.accuracy)}</dd></dl></li>
                <li><dl><dt>When it answered</dt><dd>{pct(report.answeredAccuracy)}</dd></dl></li>
                <li><dl><dt>Rejected</dt><dd>{pct(report.rejectionRate)}</dd></dl></li>
              </ul>
              <div className="table-wrap" style={{ marginBottom: 12 }}>
                <table className="table">
                  <caption className="sr-only">Per-letter results</caption>
                  <thead><tr><th scope="col">Letter</th><th scope="col">Samples</th><th scope="col">Correct</th><th scope="col">Rejected</th><th scope="col">Precision</th><th scope="col">Recall</th></tr></thead>
                  <tbody>{report.perLetter.filter((p) => p.support).map((p) => <tr key={p.letter}><th scope="row">{p.letter}</th><td>{p.support}</td><td>{p.correct}</td><td>{p.rejected}</td><td>{pct(p.precision)}</td><td>{pct(p.recall)}</td></tr>)}</tbody>
                </table>
              </div>
              {report.confusions.length > 0 && <p className="muted" style={{ fontSize: 13 }}>Most confused: {report.confusions.slice(0, 5).map((c) => `${c.true}→${c.predicted} (${c.count})`).join(', ')}.</p>}
              <details className="data-table"><summary>Confusion matrix (rows: true letter, columns: predicted)</summary>
                <div className="table-wrap" style={{ marginTop: 8 }}>
                  <table className="table confusion">
                    <thead><tr><th scope="col">true \ pred</th>{confusionCols.map((c) => <th key={c} scope="col">{c}</th>)}<th scope="col">none</th></tr></thead>
                    <tbody>{report.labels.map((t) => <tr key={t}><th scope="row">{t}</th>{confusionCols.map((c) => <td key={c} className={c === t && report.matrix[t][c] ? 'diag' : report.matrix[t][c] ? 'off' : ''}>{report.matrix[t][c] || ''}</td>)}<td>{report.matrix[t].rejected || ''}</td></tr>)}</tbody>
                  </table>
                </div>
              </details>
            </>
          )}
          <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn btn-outline btn-sm" disabled={!samples.length} onClick={() => download('echosign-sign-samples.json', JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), samples }, null, 1), 'application/json')}><Download size={15} aria-hidden="true" /> Export samples</button>
            <button className="btn btn-outline btn-sm" disabled={!samples.length} onClick={() => download('echosign-sign-report.md', toMarkdown(report), 'text/markdown')}><Download size={15} aria-hidden="true" /> Export report</button>
            <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}><Upload size={15} aria-hidden="true" /> Import samples</button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={onImport} aria-label="Import samples file" />
            <button className="btn btn-ghost btn-sm" disabled={!samples.length} onClick={clearAll}><Trash2 size={15} aria-hidden="true" /> Delete all</button>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Combine several people’s exports and score them from the command line with <code>node scripts/eval-signs.mjs file1.json file2.json</code>. Results describe only the people, cameras and conditions recorded here.</p>
        </section>
      </div>

      <aside className="stack lab-side" aria-label="Camera">
        <section className="card" aria-labelledby="rc-h">
          <h2 id="rc-h" className="card-title">Camera</h2>
          <SignView sign={sign} />
          {sign.status === 'running' && <p style={{ marginTop: 10 }}><StatusBadge status={sign.hand === 'detected' ? 'ok' : 'info'}>{sign.hand === 'detected' ? 'Hand detected' : 'Show your hand'}</StatusBadge></p>}
        </section>
      </aside>
    </div>
  );
}
