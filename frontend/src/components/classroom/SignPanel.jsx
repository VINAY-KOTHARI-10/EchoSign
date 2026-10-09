import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Delete, Hand, Plus, Trash2 } from 'lucide-react';
import { GESTURES } from '../../lib/signGestures';
import { LETTERS } from '../../lib/fingerspelling';
import HandDiagram from '../HandDiagram';
import { StatusBadge } from '../ui';
import { useToast } from '../../context/ToastContext';

const SAMPLES = 8;

// What the camera is doing right now, in words (shown on screen and announced to screen readers).
export function signStatus(sign, paused) {
  if (paused) return { status: 'warn', text: 'Paused' };
  if (sign.status === 'error') return { status: 'error', text: 'Camera unavailable' };
  if (sign.status === 'loading') return { status: 'info', text: 'Starting…' };
  if (sign.status === 'running') {
    const c = sign.current;
    return c ? { status: 'ok', text: `Detected: ${c.letter || c.phrase}` } : { status: 'info', text: 'Detecting hands' };
  }
  return { status: 'off', text: 'Off' };
}

// The camera preview itself (video + hand overlay + what was detected). It sits on the caption stage.
// The video and canvas must be rendered exactly once, because the recogniser attaches to them.
export function SignPreview({ sign }) {
  const hidden = sign.status === 'idle' || sign.status === 'error';
  const c = sign.current;
  return (
    <div className="cam-inset" hidden={hidden}>
      <video ref={sign.videoRef} playsInline muted aria-label="Your camera preview (mirrored)" />
      <canvas ref={sign.canvasRef} aria-hidden="true" />
      <div className={`detect ${c ? '' : 'idle'}`} aria-hidden="true">
        <i />
        <span style={{ flex: 1, minWidth: 0 }}>
          {sign.status === 'loading' ? 'Loading hand tracking…' : c ? <>Sign detected<br /><b>{c.letter || c.phrase}</b></> : 'Detecting…'}
          {c && <div className="bar"><i style={{ width: `${sign.progress * 100}%`, background: '#4ade80' }} /></div>}
        </span>
      </div>
    </div>
  );
}

// Camera card: permission / error states, mode switch, start / stop and (for fingerspelling) the word being built.
export function SignCamera({ sign, signMode, setSignMode, word, setWord, autoSend, setAutoSend, sendWord, live, paused }) {
  const running = sign.status === 'running' || sign.status === 'loading';
  const st = signStatus(sign, paused);

  return (
    <section className="card" aria-labelledby="sign-h">
      <div className="row between" style={{ marginBottom: 12 }}>
        <h2 id="sign-h" className="card-title" style={{ marginBottom: 0 }}><Hand size={16} aria-hidden="true" style={{ display: 'inline', verticalAlign: -2 }} /> Sign to text</h2>
        <span aria-live="polite"><StatusBadge status={st.status}>{st.text}</StatusBadge></span>
      </div>

      <div className="pill-group" role="group" aria-label="Sign recognition mode" style={{ marginBottom: 12 }}>
        <button className={`pill ${signMode === 'letters' ? 'on' : ''}`} aria-pressed={signMode === 'letters'} onClick={() => setSignMode('letters')}>Fingerspell A–Z</button>
        <button className={`pill ${signMode === 'phrases' ? 'on' : ''}`} aria-pressed={signMode === 'phrases'} onClick={() => setSignMode('phrases')}>Phrase gestures</button>
      </div>

      <div className="sign-stage">
        {sign.status === 'idle' && (
          <div className="sign-placeholder"><CameraOff size={28} aria-hidden="true" /><b>Camera is off</b>
            <span>Your video stays on this device. Only the recognised text is shared.</span></div>
        )}
        {(sign.status === 'running' || sign.status === 'loading') && (
          <div className="sign-placeholder ok"><Camera size={28} aria-hidden="true" /><b>{sign.status === 'loading' ? 'Starting the camera…' : 'Camera is on'}</b>
            <span>Your preview is shown on the caption stage above.</span></div>
        )}
        {sign.status === 'error' && (
          <div className="sign-placeholder error" role="alert"><CameraOff size={28} aria-hidden="true" /><b>{sign.error || 'Could not start the camera'}</b>
            <span>Allow camera access using the icon in your browser’s address bar, then try again.</span></div>
        )}
      </div>

      <button className={`btn btn-block ${running ? 'btn-outline' : 'btn-primary'}`} style={{ marginTop: 12 }} disabled={!live} onClick={running ? sign.stop : sign.start}>
        {running ? <><CameraOff size={18} aria-hidden="true" /> Stop camera</> : <><Camera size={18} aria-hidden="true" /> {sign.status === 'error' ? 'Try again' : 'Start camera'}</>}
      </button>

      {signMode === 'letters' && (
        <div style={{ marginTop: 14 }}>
          <div className="field-label" id="spell-label">Word being spelled</div>
          <div className="spell-box" role="status" aria-labelledby="spell-label" aria-live="polite">
            {word ? <span className="mono">{word}</span> : <span className="muted" style={{ fontSize: 14, fontWeight: 500, letterSpacing: 0 }}>Letters you sign appear here</span>}
          </div>
          <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={() => setWord((w) => `${w} `)} disabled={!word}>Space</button>
            <button className="btn btn-outline btn-sm" onClick={() => setWord((w) => w.slice(0, -1))} disabled={!word} aria-label="Delete last letter"><Delete size={15} aria-hidden="true" /></button>
            <button className="btn btn-ghost btn-sm" onClick={() => setWord('')} disabled={!word}>Clear</button>
            <button className="btn btn-primary btn-sm" onClick={sendWord} disabled={!live || !word.trim()}>Send</button>
          </div>
          <label className="check"><input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} /> Send automatically after a pause</label>
        </div>
      )}
    </section>
  );
}

// Reference card: which letters / gestures are supported, plus the teacher's recorder for class gestures.
export function SignGuide({ sign, signMode, setSignMode, customGestures, canManage, onSaveGestures }) {
  const toast = useToast();
  const [teaching, setTeaching] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [step, setStep] = useState(''); // '', 'countdown:3', 'capturing', 'saving'
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const record = () => {
    const name = phrase.trim();
    if (!name) return toast('Type the phrase this gesture should caption', 'error');
    if (sign.status !== 'running') return toast('Start the camera first', 'error');
    if (signMode !== 'phrases') setSignMode('phrases');
    const samples = [];
    const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
    [3, 2, 1].forEach((n, i) => later(() => setStep(`countdown:${n}`), i * 1000));
    later(() => {
      setStep('capturing');
      for (let i = 0; i < SAMPLES; i++) later(() => { const v = sign.vectorRef.current; if (v) samples.push(v); }, i * 220);
      later(async () => {
        if (samples.length < 5) { setStep(''); return toast('Keep your hand in view while recording — try again', 'error'); }
        setStep('saving');
        try {
          await onSaveGestures([...customGestures, { id: crypto.randomUUID(), name, phrase: name, samples }]);
          toast(`Saved gesture for “${name}”`, 'success');
          setPhrase(''); setTeaching(false);
        } catch (err) { toast(err.message, 'error'); }
        setStep('');
      }, SAMPLES * 220 + 150);
    }, 3000);
  };

  const remove = async (id) => {
    try { await onSaveGestures(customGestures.filter((g) => g.id !== id)); } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <section className="card" aria-labelledby="guide-h">
      <h2 id="guide-h" className="card-title">{signMode === 'letters' ? 'ASL alphabet guide' : 'Supported gestures'}</h2>
      <p className="notice"><b>Supported:</b> ASL letters A–Z (J and Z need a motion) and the phrase gestures below. <b>Not supported:</b> full sentences or other sign languages.</p>

      {signMode === 'letters' ? (
        <>
          <p className="muted" style={{ fontSize: 13, margin: '10px 0' }}>Hold the hand upright, palm toward the camera, in good light. Diagrams are simplified.</p>
          <div className="letter-grid">
            {Object.entries(LETTERS).map(([ch, info]) => (
              <div key={ch} className="letter-cell">
                <HandDiagram letter={ch} size={56} label={false} />
                <div><b>{ch}</b>
                  {info.motion ? <span className="badge badge-warn">Needs motion</span> : info.shaky ? <span className="badge badge-warn">Less reliable</span> : <span className="badge badge-ok">Reliable</span>}
                  <span className="muted">{info.hint}</span></div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="stack" style={{ gap: 8, marginTop: 12 }}>
            {GESTURES.map((g) => (
              <div key={g.id} className="row" style={{ fontSize: 14 }}>
                <span style={{ fontSize: 22, width: 30 }} aria-hidden="true">{g.emoji}</span>
                <span className="muted" style={{ width: 100 }}>{g.label}</span>
                <b>“{g.phrase}”</b>
              </div>
            ))}
            {customGestures.map((g) => (
              <div key={g.id} className="row" style={{ fontSize: 14 }}>
                <span style={{ fontSize: 22, width: 30 }} aria-hidden="true">✋</span>
                <span className="badge badge-info" style={{ width: 100, justifyContent: 'center' }}>Class sign</span>
                <b style={{ flex: 1 }}>“{g.phrase}”</b>
                {canManage && <button className="btn btn-ghost btn-sm btn-icon" onClick={() => remove(g.id)} aria-label={`Delete the class gesture for ${g.phrase}`}><Trash2 size={15} aria-hidden="true" /></button>}
              </div>
            ))}
          </div>

          {canManage && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              {!teaching ? (
                <button className="btn btn-outline btn-sm" onClick={() => setTeaching(true)}><Plus size={15} aria-hidden="true" /> Teach the class a new gesture</button>
              ) : (
                <div className="stack" style={{ gap: 10 }}>
                  <p className="muted" style={{ fontSize: 13 }}>Type the word or phrase, start the camera, then click Record and hold the hand shape still for 2 seconds. Use shapes that look clearly different from each other.</p>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor="gesture-phrase">Phrase for the new gesture</label>
                    <input id="gesture-phrase" className="input" placeholder="e.g. Equation" value={phrase} maxLength={120} onChange={(e) => setPhrase(e.target.value)} />
                  </div>
                  {step && <p role="status" className="chip chip-amber" style={{ alignSelf: 'flex-start' }}>{step.startsWith('countdown') ? `Get ready… ${step.split(':')[1]}` : step === 'capturing' ? 'Recording — hold the gesture' : 'Saving…'}</p>}
                  <div className="row">
                    <button className="btn btn-primary btn-sm" disabled={!!step} onClick={record}>{step ? 'Recording…' : 'Record gesture'}</button>
                    <button className="btn btn-ghost btn-sm" disabled={!!step} onClick={() => { setTeaching(false); setPhrase(''); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
