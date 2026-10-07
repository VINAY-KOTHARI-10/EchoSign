import { useCallback, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Hand, RefreshCw, Search, Shuffle, XCircle } from 'lucide-react';
import HandDiagram from '../components/HandDiagram';
import SignView from '../components/SignView';
import { EmptyState, PageHeader, StatusBadge, TabPanel, Tabs } from '../components/ui';
import useSignRecognition from '../hooks/useSignRecognition';
import { LETTERS } from '../lib/fingerspelling';
import { GESTURES } from '../lib/signGestures';

const TABS = [{ id: 'dictionary', label: 'Dictionary' }, { id: 'practice', label: 'Practice' }, { id: 'text', label: 'Text to sign' }];
const ALL = Object.keys(LETTERS);
const RELIABLE = ALL.filter((l) => !LETTERS[l].shaky);
const reliability = (ch) => (LETTERS[ch].motion ? ['warn', 'Needs motion'] : LETTERS[ch].shaky ? ['warn', 'Less reliable'] : ['ok', 'Reliable']);
const pickRandom = (pool, not) => {
  const options = pool.length > 1 ? pool.filter((x) => x !== not) : pool;
  return options[Math.floor(Math.random() * options.length)];
};

const FILTERS = [['all', 'All letters'], ['reliable', 'Reliable'], ['shaky', 'Less reliable'], ['motion', 'Needs motion']];

// ── Dictionary ───────────────────────────────────────────────────────────────
function Dictionary() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState('A');
  const [heard, setHeard] = useState(null); // last letter the camera recognised
  const sign = useSignRecognition({ mode: 'letters', onLetter: ({ letter }) => setHeard(letter) });

  const letters = useMemo(() => ALL.filter((ch) => {
    const info = LETTERS[ch];
    if (filter === 'reliable' && (info.shaky || info.motion)) return false;
    if (filter === 'shaky' && !info.shaky) return false;
    if (filter === 'motion' && !info.motion) return false;
    const q = query.trim().toLowerCase();
    return !q || ch.toLowerCase() === q || info.hint.toLowerCase().includes(q);
  }), [query, filter]);

  const [tone, label] = reliability(selected);

  return (
    <div className="lab-layout">
      <div className="stack">
        <div className="card">
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <div className="search" style={{ maxWidth: 'none' }}>
              <Search size={16} aria-hidden="true" />
              <input className="input" type="search" placeholder="Search a letter or description (e.g. fist, thumb)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the sign dictionary" />
            </div>
            <div className="pill-group" role="group" aria-label="Filter letters">
              {FILTERS.map(([id, text]) => <button key={id} className={`pill ${filter === id ? 'on' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{text}</button>)}
            </div>
          </div>

          {letters.length === 0 ? <EmptyState icon={Search} title="No signs match">Try a different search or filter.</EmptyState> : (
            <ul className="sign-grid" aria-label="ASL alphabet">
              {letters.map((ch) => {
                const [t, l] = reliability(ch);
                return (
                  <li key={ch}>
                    <button className={`sign-card ${selected === ch ? 'selected' : ''}`} aria-pressed={selected === ch} onClick={() => setSelected(ch)} aria-label={`Letter ${ch}. ${l}. ${LETTERS[ch].hint}`}>
                      <HandDiagram letter={ch} size={88} label={false} />
                      <b className="big-letter">{ch}</b>
                      <span className={`badge badge-${t}`}>{l}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="grid grid-2">
          <section className="card" aria-labelledby="sup-h">
            <h2 id="sup-h" className="card-title"><CheckCircle2 size={16} aria-hidden="true" style={{ display: 'inline', verticalAlign: -2, color: 'var(--go)' }} /> Supported</h2>
            <ul className="plain-list">
              <li>ASL fingerspelling A–Z (J and Z need a motion)</li>
              <li>7 phrase gestures used in class (below)</li>
              <li>Custom gestures a teacher records for the class</li>
            </ul>
          </section>
          <section className="card" aria-labelledby="unsup-h">
            <h2 id="unsup-h" className="card-title"><XCircle size={16} aria-hidden="true" style={{ display: 'inline', verticalAlign: -2, color: 'var(--stop)' }} /> Not supported</h2>
            <ul className="plain-list">
              <li>Full sign-language sentences or grammar</li>
              <li>Other sign languages (BSL, ISL…) — letters are ASL</li>
              <li>Two-handed signs and moving signs other than J and Z</li>
            </ul>
          </section>
        </div>

        <section className="card" aria-labelledby="phr-h">
          <h2 id="phr-h" className="card-title">Phrase gestures</h2>
          <ul className="grid grid-3 plain-grid">
            {GESTURES.map((g) => (
              <li key={g.id} className="row" style={{ gap: 12 }}>
                <span style={{ fontSize: 32 }} aria-hidden="true">{g.emoji}</span>
                <div><b>“{g.phrase}”</b><div className="muted" style={{ fontSize: 13 }}>{g.label}</div></div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="stack lab-side" aria-label="Selected sign and live try-out">
        <section className="card" aria-labelledby="sel-h">
          <div className="row between"><h2 id="sel-h" className="card-title" style={{ marginBottom: 0 }}>Letter {selected}</h2><StatusBadge status={tone}>{label}</StatusBadge></div>
          <div className="selected-diagram"><HandDiagram letter={selected} size={150} label={false} /></div>
          <p style={{ fontWeight: 600 }}>{LETTERS[selected].hint}</p>
          {LETTERS[selected].motion && <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>Make the shape, then draw the letter in the air with your fingertip.</p>}
        </section>

        <section className="card" aria-labelledby="try-h">
          <h2 id="try-h" className="card-title">Try it live</h2>
          <SignView sign={sign} />
          <div className="recognised" role="status" aria-live="polite">
            <span className="muted">Recognised</span>
            {heard ? (
              <span className="row" style={{ gap: 8 }}><b className="sign-big">{heard}</b>
                {heard === selected ? <StatusBadge status="ok">Matches {selected}</StatusBadge> : <StatusBadge status="warn">Not {selected}</StatusBadge>}</span>
            ) : <span className="muted">Nothing yet</span>}
          </div>
        </section>
      </aside>
    </div>
  );
}

// ── Text to sign ─────────────────────────────────────────────────────────────
function TextToSign() {
  const [text, setText] = useState('hello');
  const words = text.toUpperCase().split(/\s+/).filter(Boolean).slice(0, 12);
  return (
    <section className="card" aria-labelledby="t2s-h">
      <h2 id="t2s-h" className="card-title">Spell a word in sign</h2>
      <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>Type a word or name and see each letter’s hand shape in order, so you can sign it back.</p>
      <div className="field" style={{ maxWidth: 480 }}>
        <label htmlFor="t2s">Text to spell</label>
        <input id="t2s" className="input" value={text} maxLength={60} onChange={(e) => setText(e.target.value)} placeholder="Type a word…" />
      </div>
      <div className="stack" style={{ marginTop: 8 }}>
        {words.map((w, wi) => (
          <div key={wi}>
            <div className="field-label" style={{ marginBottom: 6 }}>{w}</div>
            <ol className="spell-steps" aria-label={`Letters of ${w}`}>
              {[...w].filter((ch) => LETTERS[ch]).map((ch, i) => (
                <li key={i} className="spell-step"><HandDiagram letter={ch} size={84} /><span className="muted">{i + 1}</span></li>
              ))}
            </ol>
          </div>
        ))}
        {words.length === 0 && <EmptyState icon={Hand} title="Type a word above" />}
      </div>
    </section>
  );
}

// ── Practice ─────────────────────────────────────────────────────────────────
function Practice() {
  const [kind, setKind] = useState('letters');          // 'letters' | 'phrases'
  const [pool, setPool] = useState('reliable');         // letters to practise
  const letters = pool === 'reliable' ? RELIABLE : ALL;
  const [target, setTarget] = useState(() => pickRandom(RELIABLE));
  const [phraseTarget, setPhraseTarget] = useState(() => pickRandom(GESTURES.map((g) => g.id)));
  const [score, setScore] = useState({ correct: 0, tries: 0, streak: 0, best: 0 });
  const [feedback, setFeedback] = useState(null);       // { ok, text }
  const targetRef = useRef({ target, phraseTarget, kind, letters });
  targetRef.current = { target, phraseTarget, kind, letters };

  const record = useCallback((ok, shown) => {
    setScore((s) => {
      const streak = ok ? s.streak + 1 : 0;
      return { correct: s.correct + (ok ? 1 : 0), tries: s.tries + 1, streak, best: Math.max(s.best, streak) };
    });
    setFeedback({ ok, text: ok ? `Correct — that’s ${shown}!` : `That looked like ${shown}. Try again.` });
    if (ok) setTimeout(() => { // next target after a short pause
      const t = targetRef.current;
      if (t.kind === 'letters') setTarget(pickRandom(t.letters, t.target));
      else setPhraseTarget(pickRandom(GESTURES.map((g) => g.id), t.phraseTarget));
      setFeedback(null);
    }, 900);
  }, []);

  const sign = useSignRecognition({
    mode: kind,
    onLetter: ({ letter }) => record(letter === targetRef.current.target, letter),
    onGesture: (g) => record(g.id === targetRef.current.phraseTarget, g.phrase),
  });
  const phrase = useMemo(() => GESTURES.find((g) => g.id === phraseTarget), [phraseTarget]);

  const changeKind = (k) => { setKind(k); setFeedback(null); };
  const skip = () => {
    if (kind === 'letters') setTarget(pickRandom(letters, target)); else setPhraseTarget(pickRandom(GESTURES.map((g) => g.id), phraseTarget));
    setFeedback(null);
  };

  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <section className="card" aria-labelledby="prac-h">
        <h2 id="prac-h" className="sr-only">Practice target</h2>
        <div className="pill-group" role="group" aria-label="What to practise" style={{ marginBottom: 12 }}>
          <button className={`pill ${kind === 'letters' ? 'on' : ''}`} aria-pressed={kind === 'letters'} onClick={() => changeKind('letters')}>Letters</button>
          <button className={`pill ${kind === 'phrases' ? 'on' : ''}`} aria-pressed={kind === 'phrases'} onClick={() => changeKind('phrases')}>Phrase gestures</button>
        </div>
        {kind === 'letters' && (
          <div className="pill-group" role="group" aria-label="Which letters" style={{ marginBottom: 12 }}>
            <button className={`pill ${pool === 'reliable' ? 'on' : ''}`} aria-pressed={pool === 'reliable'} onClick={() => { setPool('reliable'); setTarget(pickRandom(RELIABLE)); }}>Reliable letters</button>
            <button className={`pill ${pool === 'all' ? 'on' : ''}`} aria-pressed={pool === 'all'} onClick={() => { setPool('all'); setTarget(pickRandom(ALL)); }}>All 26</button>
          </div>
        )}

        <div className="practice-target">
          <div className="muted" style={{ fontWeight: 800, fontSize: 12, letterSpacing: '0.08em' }}>SIGN THIS</div>
          {kind === 'letters' ? (
            <>
              <div className="practice-letter" aria-label={`Letter ${target}`}>{target}</div>
              <HandDiagram letter={target} size={120} label={false} />
              <p className="muted" style={{ fontSize: 14, maxWidth: 300, textAlign: 'center' }}>{LETTERS[target].hint}</p>
            </>
          ) : (
            <><div style={{ fontSize: 64 }} aria-hidden="true">{phrase.emoji}</div><div className="practice-phrase">“{phrase.phrase}”</div><p className="muted">{phrase.label}</p></>
          )}
          <div role="status" aria-live="polite" style={{ minHeight: 28 }}>
            {feedback && <StatusBadge status={feedback.ok ? 'ok' : 'warn'}>{feedback.text}</StatusBadge>}
          </div>
        </div>

        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={skip}><Shuffle size={15} aria-hidden="true" /> Skip</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setScore({ correct: 0, tries: 0, streak: 0, best: 0 })}><RefreshCw size={15} aria-hidden="true" /> Reset score</button>
        </div>
      </section>

      <div className="stack">
        <section className="card" aria-labelledby="cam-h">
          <h2 id="cam-h" className="card-title">Your camera</h2>
          <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>Hold the shape for a moment until the bar fills.</p>
          <SignView sign={sign} />
        </section>
        <div className="grid grid-3">
          {[['Correct', score.correct], ['Streak', score.streak], ['Best streak', score.best]].map(([l, v]) => (
            <div key={l} className="card stat"><div className="num">{v}</div><div className="label">{l}</div></div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 13 }}>{score.tries ? `${Math.round((score.correct / score.tries) * 100)}% of ${score.tries} attempts correct.` : 'No attempts yet.'}</p>
      </div>
    </div>
  );
}

export default function Signs() {
  const [tab, setTab] = useState('dictionary');
  return (
    <>
      <PageHeader icon={Hand} title="Sign Lab" subtitle="Learn, practise and convert sign language to text." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Sign Lab sections" idPrefix="lab" />
      <TabPanel id="dictionary" active={tab === 'dictionary'} idPrefix="lab"><Dictionary /></TabPanel>
      <TabPanel id="practice" active={tab === 'practice'} idPrefix="lab"><Practice /></TabPanel>
      <TabPanel id="text" active={tab === 'text'} idPrefix="lab"><TextToSign /></TabPanel>
    </>
  );
}
