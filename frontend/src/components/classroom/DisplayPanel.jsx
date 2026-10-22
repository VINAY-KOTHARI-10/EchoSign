// DisplayPanel - classroom display panel
import { LANGS } from '../../lib';

// Per-viewer comfort settings: text, spacing, theme, reading pace, translation and alerts.
export default function DisplayPanel({ prefs, update, reset, translationError }) {
  const setAlert = (patch) => update({ alerts: patch });

  return (
    <div className="card">
      <div className="row between"><h2 className="card-title" style={{ marginBottom: 0 }}>Caption display</h2>
        <button className="btn btn-ghost btn-sm" onClick={reset}>Reset</button></div>

      <div className="settings-grid">
        <label className="setting">Text size
          <span className="row"><input type="range" min={18} max={72} value={prefs.size} onChange={(e) => update({ size: Number(e.target.value) })} aria-label="Caption text size" /><span className="mono muted">{prefs.size}px</span></span>
        </label>
        <label className="setting">Line spacing
          <span className="row"><input type="range" min={1.1} max={2.4} step={0.05} value={prefs.lineHeight} onChange={(e) => update({ lineHeight: Number(e.target.value) })} aria-label="Line spacing" /><span className="mono muted">{prefs.lineHeight.toFixed(2)}</span></span>
        </label>
        <label className="setting">Letter spacing
          <span className="row"><input type="range" min={0} max={0.15} step={0.01} value={prefs.letterSpacing} onChange={(e) => update({ letterSpacing: Number(e.target.value) })} aria-label="Letter spacing" /><span className="mono muted">{prefs.letterSpacing.toFixed(2)}</span></span>
        </label>
        <label className="setting">Font
          <select className="select" value={prefs.font} onChange={(e) => update({ font: e.target.value })}>
            {Object.entries(FONTS).map(([id, f]) => <option key={id} value={id}>{f.label}</option>)}
          </select>
        </label>
      </div>

      <div className="setting" style={{ marginTop: 12 }}>Colours
        <div className="pill-group">{THEMES.map((t) => <button key={t.id} className={`pill ${prefs.theme === t.id ? 'on' : ''}`} onClick={() => update({ theme: t.id })}>{t.label}</button>)}</div>
      </div>

      <div className="setting" style={{ marginTop: 12 }}>Reading pace
        <div className="pill-group">{PACES.map((p) => <button key={p.wpm} className={`pill ${prefs.paceWpm === p.wpm ? 'on' : ''}`} onClick={() => update({ paceWpm: p.wpm })}>{p.label}{p.wpm ? ` · ${p.wpm} wpm` : ''}</button>)}</div>
      </div>

      <label className="setting" style={{ marginTop: 12 }}>Translate captions to
        <select className="select" value={prefs.translateTo} onChange={(e) => update({ translateTo: e.target.value })}>
          <option value="">Off</option>
          {LANGS.map((l) => <option key={l.code} value={l.name}>{l.name}</option>)}
        </select>
        {translationError && <span className="error-text" style={{ marginBottom: 0 }}>{translationError}</span>}
      </label>

      <label className="row" style={{ gap: 8, fontSize: 14, fontWeight: 600, marginTop: 12 }}>
        <input type="checkbox" checked={prefs.showNames} onChange={(e) => update({ showNames: e.target.checked })} /> Show speaker names
      </label>

      <details className="alert-settings">
        <summary>Alerts (flash and vibration)</summary>
        <p className="muted" style={{ fontSize: 13, margin: '8px 0' }}>Get a visual signal when something addressed to you is captioned — useful if you can't hear the room.</p>
        <label className="row" style={{ gap: 8, fontSize: 14 }}><input type="checkbox" checked={prefs.alerts.name} onChange={(e) => setAlert({ name: e.target.checked })} /> When my name is said</label>
        <label className="row" style={{ gap: 8, fontSize: 14, marginTop: 6 }}><input type="checkbox" checked={prefs.alerts.question} onChange={(e) => setAlert({ question: e.target.checked })} /> When a question is asked</label>
        <div className="field" style={{ marginTop: 10, marginBottom: 6 }}>
          <label htmlFor="alert-words">Also alert on these words (comma separated)</label>
          <input id="alert-words" className="input" placeholder="exam, homework, deadline" value={prefs.alerts.words} onChange={(e) => setAlert({ words: e.target.value })} />
        </div>
        <label className="row" style={{ gap: 8, fontSize: 14 }}><input type="checkbox" checked={prefs.alerts.flash} onChange={(e) => setAlert({ flash: e.target.checked })} /> Flash the screen</label>
        <label className="row" style={{ gap: 8, fontSize: 14, marginTop: 6 }}><input type="checkbox" checked={prefs.alerts.vibrate} onChange={(e) => setAlert({ vibrate: e.target.checked })} /> Vibrate (phones)</label>
      </details>
    </div>
  );
}

