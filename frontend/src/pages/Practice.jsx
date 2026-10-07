import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Mic, RefreshCw, RotateCcw, SkipForward, Square, Volume2, XCircle } from 'lucide-react';
import * as api from '../api';
import { LANGS, langBcp, scoreColor } from '../lib';
import useSpeech, { canSpeak, speak } from '../hooks/useSpeech';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../components/ui';

const LEVELS = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']];

function ScoreRing({ score }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div className="score-ring" role="img" aria-label={`Accuracy ${pct} percent`} style={{ background: `conic-gradient(${scoreColor(pct)} ${pct * 3.6}deg, var(--violet-light) 0)` }}>
      <span aria-hidden="true">{pct}%</span>
    </div>
  );
}

const Waveform = ({ active }) => (
  <div className={`wave ${active ? 'on' : ''}`} aria-hidden="true">
    {Array.from({ length: 28 }, (_, i) => <i key={i} style={{ animationDelay: `${(i % 7) * 90}ms`, height: active ? undefined : 6 + ((i * 7) % 5) * 2 }} />)}
  </div>
);

// Tone for a 0-100 score, shown with an icon and a word so it never relies on colour alone.
const scoreTone = (n) => (n >= 80 ? ['ok', 'Strong'] : n >= 60 ? ['warn', 'Okay'] : ['error', 'Needs work']);

export default function Practice() {
  const toast = useToast();
  const { user, refresh } = useAuth();
  const [lang, setLang] = useState(user?.profile?.targetLanguages?.[0] || 'en');
  const [level, setLevel] = useState('beginner');
  const [phrases, setPhrases] = useState([]);
  const [idx, setIdx] = useState(0);
  const [loadingPhrases, setLoadingPhrases] = useState(false);
  const [phraseError, setPhraseError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [result, setResult] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef(Date.now());

  const phrase = phrases[idx];

  const analyze = useCallback(async (spoken) => {
    if (!phrase) return;
    setAnalyzing(true); setAnalysisError('');
    try {
      const res = await api.speech.analyze({ targetText: phrase.text, transcribedText: spoken, language: lang });
      const data = res.data;
      setResult(data);
      const words = data.wordsBreakdown || [];
      await api.sessions.create({
        language: lang,
        duration: Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)),
        accuracy: data.overallAccuracy,
        wordsAttempted: words.length || phrase.text.split(/\s+/).length,
        wordsCorrect: words.filter((w) => w.score >= 70).length,
        transcript: spoken,
        feedback: (data.suggestions || []).join(' '),
      });
      refresh().catch(() => {});
    } catch (err) {
      setAnalysisError(err.message);
      toast(err.message, 'error');
    } finally { setAnalyzing(false); }
  }, [phrase, lang, toast, refresh]);

  const speech = useSpeech(langBcp(lang), { onFinal: analyze });

  const loadPhrases = useCallback(async (refreshNow = false) => {
    setLoadingPhrases(true); setResult(null); setAnalysisError(''); setPhraseError('');
    try {
      const res = await api.phrases.daily({ lang, difficulty: level, refresh: refreshNow ? '1' : undefined });
      setPhrases(res.data.phrases || []);
      setIdx(0);
    } catch (err) { setPhraseError(err.message); }
    finally { setLoadingPhrases(false); }
  }, [lang, level]);

  useEffect(() => { loadPhrases(); }, [loadPhrases]);

  // recording timer
  useEffect(() => {
    if (!speech.listening) { setSeconds(0); return undefined; }
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [speech.listening]);

  const toggleMic = () => {
    if (speech.listening) return speech.stop();
    setResult(null); setAnalysisError('');
    startedAt.current = Date.now();
    speech.start();
  };
  const retry = () => { setResult(null); setAnalysisError(''); speech.setTranscript(''); };
  const next = () => { setIdx((i) => (i + 1) % Math.max(phrases.length, 1)); retry(); };

  // one state at a time, in words
  const state = loadingPhrases ? 'loading' : speech.listening ? 'recording' : analyzing ? 'processing' : analysisError || speech.error ? 'error' : result ? 'success' : 'idle';
  const stateText = {
    loading: 'Loading phrases…', recording: `Recording… ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`,
    processing: 'Analysing your pronunciation…', error: 'Something went wrong', success: 'Done — see your feedback', idle: 'Tap the microphone and read the phrase aloud',
  }[state];

  const metrics = result ? [['Overall accuracy', result.overallAccuracy], ['Fluency', result.fluencyScore], ['Intonation', result.intonationScore], ['Stress', result.stressScore]].filter(([, v]) => typeof v === 'number') : [];

  return (
    <>
      <PageHeader icon={Mic} title="Practice" subtitle="Say a phrase out loud and get instant pronunciation feedback."
        actions={(
          <>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="p-lang" className="sr-only">Language</label>
              <select id="p-lang" className="select" value={lang} onChange={(e) => setLang(e.target.value)}>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="p-level" className="sr-only">Level</label>
              <select id="p-level" className="select" value={level} onChange={(e) => setLevel(e.target.value)}>{LEVELS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
            </div>
          </>
        )} />

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section className="card practice-card" aria-labelledby="say-h">
          <div className="muted say-label" id="say-h">Say this phrase</div>
          {loadingPhrases ? <LoadingState label="Loading phrases…" />
            : phraseError ? <EmptyState icon={XCircle} title="Couldn’t load phrases" action={<button className="btn btn-outline btn-sm" onClick={() => loadPhrases()}>Try again</button>}>{phraseError}</EmptyState>
            : phrase ? (
              <div className="phrase-box">
                {phrase.topic && <StatusBadge status="info">{phrase.topic}</StatusBadge>}
                <div className="phrase-text" lang={lang}>“{phrase.text}”</div>
                {phrase.phonetic && <div className="mono muted" style={{ fontSize: 14 }}>{phrase.phonetic}</div>}
                {phrase.translation && phrase.translation.trim().toLowerCase() !== phrase.text.trim().toLowerCase() && <div className="muted">{phrase.translation}</div>}
              </div>
            ) : <EmptyState icon={Mic} title="No phrases available">Try a different language or level.</EmptyState>}

          <div className="row between wrap" style={{ marginTop: 14 }}>
            <div className="row">
              {canSpeak() && <button className="btn btn-outline btn-sm" disabled={!phrase} onClick={() => speak(phrase.text, langBcp(lang))}><Volume2 size={15} aria-hidden="true" /> Listen</button>}
              <button className="btn btn-outline btn-sm" disabled={loadingPhrases} onClick={() => loadPhrases(true)}><RefreshCw size={15} aria-hidden="true" /> New phrases</button>
            </div>
            <span className="muted" style={{ fontSize: 13 }} aria-live="polite">{phrases.length ? `Phrase ${idx + 1} of ${phrases.length}` : ''}</span>
          </div>

          <div className="recorder">
            <Waveform active={state === 'recording'} />
            {speech.supported ? (
              <button className={`mic-btn ${speech.listening ? 'rec' : ''}`} onClick={toggleMic} disabled={!phrase || analyzing} aria-label={speech.listening ? 'Stop recording' : 'Start recording'}>
                {speech.listening ? <Square size={30} aria-hidden="true" /> : <Mic size={34} aria-hidden="true" />}
              </button>
            ) : <div className="error-text" role="alert">Speech recognition isn’t supported in this browser. Use Chrome or Edge.</div>}
            <div role="status" aria-live="polite" className={`rec-state ${state}`}>{stateText}</div>
          </div>

          <div className="transcript" aria-live="polite" aria-label="What we heard">
            {speech.transcript || <span className="muted">What we hear will appear here.</span>}
          </div>
          {(analysisError || speech.error) && <div className="error-text" role="alert" style={{ marginTop: 10 }}>{analysisError || speech.error}</div>}

          <div className="row" style={{ marginTop: 14, gap: 8 }}>
            <button className="btn btn-outline" onClick={retry} disabled={!result && !analysisError && !speech.transcript}><RotateCcw size={16} aria-hidden="true" /> Retry</button>
            <button className="btn btn-primary" onClick={next} disabled={phrases.length < 2}>Next phrase <SkipForward size={16} aria-hidden="true" /></button>
          </div>
        </section>

        <section className="card" aria-labelledby="fb-h" aria-busy={analyzing}>
          <h2 id="fb-h" className="card-title">AI feedback</h2>
          {analyzing && <LoadingState label="Analysing your pronunciation…" />}
          {!analyzing && !result && <EmptyState icon={Mic} title="No feedback yet">Record a phrase and your score, word-by-word results and tips will appear here.</EmptyState>}
          {!analyzing && result && (
            <div className="stack">
              <div className="row" style={{ gap: 24, alignItems: 'center' }}>
                <ScoreRing score={result.overallAccuracy} />
                <ul className="metric-list" aria-label="Score breakdown">
                  {metrics.map(([label, value]) => {
                    const [tone, word] = scoreTone(value);
                    return (
                      <li key={label}>
                        <span>{label}</span>
                        <span className="row" style={{ gap: 8 }}><b>{Math.round(value)}</b>
                          <span className={`badge badge-${tone}`}>{tone === 'ok' ? <CheckCircle2 size={12} aria-hidden="true" /> : null}{word}</span></span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {result.wordsBreakdown?.length > 0 && (
                <div>
                  <h3 className="card-title" style={{ fontSize: 14 }}>Word by word</h3>
                  <ul className="word-list">
                    {result.wordsBreakdown.map((w, i) => {
                      const [tone, word] = scoreTone(w.score);
                      return <li key={i} className={`word-chip tone-${tone}`}>{w.word} <span>{Math.round(w.score)} · {word}</span></li>;
                    })}
                  </ul>
                </div>
              )}

              {result.suggestions?.length > 0 && (
                <div className="tip-box">
                  <h3 className="card-title" style={{ fontSize: 14 }}>Tips to improve</h3>
                  <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>{result.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
