import { useEffect, useRef, useState } from 'react';
import { Bot, Mic, MicOff, Send, Volume2, VolumeX } from 'lucide-react';
import * as api from '../api';
import { LANGS, langBcp, langName } from '../lib';
import useSpeech, { canSpeak, speak, stopSpeaking } from '../hooks/useSpeech';
import { useToast } from '../context/ToastContext';
import { PageHeader, StatusBadge } from '../components/ui';

const SCENARIOS = [
  { key: 'casual', label: 'Casual chat', emoji: '💬', desc: 'Everyday small talk', prompt: 'Have a casual, friendly conversation in everyday language.' },
  { key: 'restaurant', label: 'Restaurant', emoji: '🍽️', desc: 'Order food and drinks', prompt: 'Role-play ordering food at a restaurant. You are the waiter.' },
  { key: 'travel', label: 'Travel', emoji: '✈️', desc: 'Ask for directions and help', prompt: 'Role-play a traveler asking for directions and help. You are a local.' },
  { key: 'interview', label: 'Job interview', emoji: '💼', desc: 'Practise answering questions', prompt: 'Role-play a job interview. You are the interviewer.' },
  { key: 'shopping', label: 'Shopping', emoji: '🛍️', desc: 'Buy things in a shop', prompt: 'Role-play shopping in a store. You are the shop assistant.' },
  { key: 'doctor', label: "Doctor's visit", emoji: '🩺', desc: 'Describe how you feel', prompt: 'Role-play a doctor appointment. You are the doctor.' },
];
const LEVELS = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];
const hhmm = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function Conversation() {
  const toast = useToast();
  const [lang, setLang] = useState('es');
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [level, setLevel] = useState('medium');
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scores, setScores] = useState([]);
  const [speakingId, setSpeakingId] = useState(null); // index of the message being read aloud
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);
  useEffect(() => () => stopSpeaking(), []);

  const play = (text, idx) => {
    if (speakingId === idx) { stopSpeaking(); setSpeakingId(null); return; }
    speak(text, langBcp(lang), { onStart: () => setSpeakingId(idx), onEnd: () => setSpeakingId((cur) => (cur === idx ? null : cur)) });
  };

  const send = async (text) => {
    const userMessage = text.trim();
    if (!userMessage || busy) return;
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: 'user', text: userMessage, at: new Date() }]);
    setInput(''); setBusy(true); setError('');
    try {
      const res = await api.conversation.chat({
        userMessage, language: langName(lang), conversationHistory: history,
        scenario: scenario.prompt, difficulty: level,
      });
      const d = res.data;
      const idx = messages.length + 1; // index the AI reply will have
      setMessages((m) => [...m, { role: 'ai', text: d.reply, translation: d.translation, correction: d.correction, encouragement: d.encouragement, at: new Date() }]);
      if (typeof d.score === 'number') setScores((s) => [...s, d.score]);
      if (canSpeak()) speak(d.reply, langBcp(lang), { onStart: () => setSpeakingId(idx), onEnd: () => setSpeakingId((cur) => (cur === idx ? null : cur)) });
    } catch (err) { setError(err.message); toast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  const speech = useSpeech(langBcp(lang), { onFinal: send });
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  // ── Setup ───────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <>
        <PageHeader icon={Bot} title="AI Partner" subtitle="Have a real conversation in your target language. Your partner replies, translates and gently corrects you." />
        <form className="card stack" style={{ gap: 22 }} onSubmit={(e) => { e.preventDefault(); setStarted(true); }}>
          <div className="grid grid-2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="c-lang">Language to practise</label>
              <select id="c-lang" className="select" value={lang} onChange={(e) => setLang(e.target.value)}>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select>
            </div>
            <fieldset className="fieldset">
              <legend className="field-label">Difficulty</legend>
              <div className="pill-group" role="radiogroup" aria-label="Difficulty">
                {LEVELS.map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={level === v} className={`pill ${level === v ? 'on' : ''}`} onClick={() => setLevel(v)}>{t}</button>)}
              </div>
            </fieldset>
          </div>

          <fieldset className="fieldset">
            <legend className="field-label">Choose a scenario</legend>
            <div className="grid grid-3 scenario-grid" role="radiogroup" aria-label="Scenario">
              {SCENARIOS.map((s) => (
                <button key={s.key} type="button" role="radio" aria-checked={scenario.key === s.key} className={`scenario ${scenario.key === s.key ? 'on' : ''}`} onClick={() => setScenario(s)}>
                  <span className="scenario-emoji" aria-hidden="true">{s.emoji}</span>
                  <b>{s.label}</b><span className="muted">{s.desc}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <div><button className="btn btn-primary btn-lg">Start conversation</button></div>
        </form>
      </>
    );
  }

  // ── Conversation ────────────────────────────────────────────────────────
  const speaking = speakingId !== null;
  return (
    <>
      <PageHeader icon={Bot} title="AI Partner"
        subtitle={<span className="row wrap" style={{ gap: 8 }}><span className="chip">{scenario.emoji} {scenario.label}</span><span className="chip">{langName(lang)}</span><span className="chip">{LEVELS.find(([v]) => v === level)[1]}</span>{avg !== null && <StatusBadge status="ok">Average score {avg}</StatusBadge>}</span>}
        actions={<button className="btn btn-outline btn-sm" onClick={() => { stopSpeaking(); setStarted(false); setMessages([]); setScores([]); setError(''); }}>Change setup</button>} />

      <section className="card chat-box" aria-label="Conversation">
        <div className="messages" role="log" aria-live="polite" aria-relevant="additions">
          {messages.length === 0 && <div className="state"><div className="state-icon" aria-hidden="true"><Bot size={26} /></div><h3>Say hello in {langName(lang)}</h3><p>Type a message or use the microphone to start.</p></div>}
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role === 'user' ? 'me' : 'them'}`}>
              <div className="avatar-sm" aria-hidden="true">{m.role === 'user' ? 'You' : <Bot size={16} />}</div>
              <div className="msg-body">
                <div className={`bubble ${m.role === 'user' ? 'me' : 'them'}`}>
                  <span className="sr-only">{m.role === 'user' ? 'You said: ' : 'Partner said: '}</span>{m.text}
                  {m.role === 'ai' && (
                    <>
                      {m.translation && <small>{m.translation}</small>}
                      {m.correction && <small className="correction"><b>Correction:</b> {m.correction}</small>}
                      {m.encouragement && <small>✨ {m.encouragement}</small>}
                    </>
                  )}
                </div>
                <div className="msg-meta">
                  <span>{hhmm(m.at)}</span>
                  {m.role === 'ai' && canSpeak() && (
                    <button className="btn btn-ghost btn-sm" onClick={() => play(m.text, i)} aria-label={speakingId === i ? 'Stop playback' : 'Play this reply aloud'}>
                      {speakingId === i ? <><VolumeX size={14} aria-hidden="true" /> Stop</> : <><Volume2 size={14} aria-hidden="true" /> Play</>}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {busy && <div className="msg them" role="status"><div className="avatar-sm" aria-hidden="true"><Bot size={16} /></div><div className="bubble them typing"><span className="sr-only">Partner is typing</span><i /><i /><i /></div></div>}
          <div ref={endRef} />
        </div>

        <div className="chat-status" aria-live="polite">
          {speaking && <StatusBadge status="info">Speaking…</StatusBadge>}
          {speech.listening && <StatusBadge status="live">Listening…</StatusBadge>}
        </div>
        {(error || speech.error) && <div className="error-text" role="alert">{error || speech.error}</div>}

        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          {speech.supported && (
            <button type="button" className={`btn btn-icon ${speech.listening ? 'btn-danger' : 'btn-outline'}`} onClick={speech.listening ? speech.stop : speech.start} aria-label={speech.listening ? 'Stop voice input' : 'Start voice input'} aria-pressed={speech.listening}>
              {speech.listening ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
            </button>
          )}
          <label htmlFor="c-input" className="sr-only">Your message in {langName(lang)}</label>
          <input id="c-input" className="input" value={speech.listening ? speech.transcript : input} onChange={(e) => setInput(e.target.value)} placeholder={`Type in ${langName(lang)}…`} autoComplete="off" />
          <button className="btn btn-primary btn-icon" disabled={busy || !input.trim()} aria-label="Send message"><Send size={18} aria-hidden="true" /></button>
        </form>
      </section>
    </>
  );
}
