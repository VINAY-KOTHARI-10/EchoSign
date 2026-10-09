import { useState } from 'react';
import { Keyboard, Send } from 'lucide-react';

const QUICK_PHRASES = [
  'Please repeat that', 'Please slow down', 'I have a question', "I don't understand",
  'Can you write that on the board?', 'Thank you',
];

export default function TypePanel({ live, onSend }) {
  const [typed, setTyped] = useState('');
  const send = (text) => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setTyped('');
  };

  return (
    <div className="card">
      <h2 className="card-title"><Keyboard size={16} style={{ display: 'inline', verticalAlign: -2 }} /> Type a caption</h2>
      <form className="composer" style={{ marginTop: 0 }} onSubmit={(e) => { e.preventDefault(); send(typed); }}>
        <input className="input" value={typed} maxLength={500} disabled={!live} placeholder="Type anything…" onChange={(e) => setTyped(e.target.value)} aria-label="Type a caption" />
        <button className="btn btn-primary" disabled={!live || !typed.trim()} aria-label="Send caption"><Send size={18} /></button>
      </form>
      <div className="pill-group" style={{ marginTop: 12 }}>
        {QUICK_PHRASES.map((p) => <button key={p} type="button" className="pill" disabled={!live} onClick={() => send(p)}>{p}</button>)}
      </div>
    </div>
  );
}
