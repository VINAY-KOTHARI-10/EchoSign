import { useRef, useState } from 'react';
import { Send } from 'lucide-react';
import * as api from '../../../api';
import { StatusBadge } from '../../../components/ui';

const IDEAS = [
  ['Explain simply', 'Can you explain the main idea of this lecture in simple words?'],
  ['Key definitions', 'What important terms were defined in this lecture?'],
  ['Examples', 'What examples did the teacher give?'],
  ['Revision questions', 'What should I revise from this lecture?'],
];

// Ask questions about THIS lecture. Answers come from the saved transcript (and notes) with timestamps; if the lecture
// did not cover something, the answer says so instead of making it up.
export default function AskPanel({ room, captionCount, onJump }) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState([]);
  const [error, setError] = useState('');
  const bottom = useRef(null);

  const ask = async (text) => {
    const q = (text ?? question).trim();
    if (q.length < 3 || busy) return;
    setBusy(true); setError(''); setQuestion('');
    setThread((t) => [...t, { role: 'me', text: q }]);
    try {
      const res = await api.classrooms.ask(room.code, q);
      setThread((t) => [...t, { role: 'ai', ...res.data }]);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); setTimeout(() => bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50); }
  };

  return (
    <div className="stack">
      <section className="card" aria-labelledby="ask-h">
        <h2 id="ask-h" className="card-title">Ask your lecture</h2>
        <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>
          Questions are answered from what was said in this class{room.summary ? ' and the saved notes' : ''}, with the time it was said. If the lecture didn’t cover it, you’ll be told.
        </p>
        {captionCount === 0 && <p className="notice">Nothing has been captioned yet, so there is nothing to ask about.</p>}
        <div className="pill-group" style={{ marginBottom: 12 }} role="group" aria-label="Question ideas">
          {IDEAS.map(([label, q]) => <button key={label} className="pill" disabled={busy || captionCount === 0} onClick={() => ask(q)}>{label}</button>)}
        </div>

        <div className="ask-thread" role="log" aria-live="polite" aria-label="Conversation about the lecture">
          {thread.map((m, i) => (m.role === 'me'
            ? <p key={i} className="ask-me">{m.text}</p>
            : (
              <div key={i} className="ask-ai">
                <p>{m.answer}</p>
                <div className="row wrap" style={{ gap: 6, margin: '6px 0' }}>
                  {m.provider === 'search' ? <StatusBadge status="warn">Search only, AI unavailable</StatusBadge>
                    : <StatusBadge status={m.covered ? 'info' : 'warn'}>{m.covered ? 'From the lecture' : 'Not covered in the lecture'}</StatusBadge>}
                </div>
                {m.extraExplanation && <p className="muted" style={{ fontSize: 13 }}>Part of this answer is extra explanation that was not said in the lecture.</p>}
                {m.coverage?.note && <p className="muted" style={{ fontSize: 13 }}>{m.coverage.note}</p>}
                {m.references?.length > 0 && (
                  <ul className="ask-refs" aria-label="Where this was said">
                    {m.references.map((r) => (
                      <li key={r.id}>
                        <button className="link-btn" onClick={() => onJump?.(r.id)}><span className="mono">{r.at}</span> {r.speaker}: “{r.text}”</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )))}
          {busy && <p className="muted" role="status">Looking through the lecture…</p>}
          <div ref={bottom} />
        </div>
        {error && <div className="error-text" role="alert">{error}</div>}

        <form className="row" style={{ gap: 8, marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <label className="sr-only" htmlFor="ask-q">Your question about the lecture</label>
          <input id="ask-q" className="input" style={{ flex: 1 }} maxLength={500} placeholder="e.g. What did the teacher say about acceleration?" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={captionCount === 0} />
          <button className="btn btn-primary" disabled={busy || question.trim().length < 3 || captionCount === 0}><Send size={16} aria-hidden="true" /> Ask</button>
        </form>
      </section>
    </div>
  );
}
