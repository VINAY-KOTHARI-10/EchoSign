import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Mic, RefreshCw, RotateCcw, SkipForward, Square, Volume2, XCircle } from 'lucide-react';
import * as api from '../../../api';
import { langBcp, scoreColor } from '../../../lib';
import { useLanguages } from '../../../lib/languages';
import { avoidParam, loadRecent, pickUnseen, rememberPhrase } from '../../../lib/phrasePicker.js';
import { describeLoudness, describePace, describePitch } from '../../../lib/voiceMetrics.js';
import useSpeech, { canSpeak, speak } from '../../../hooks/useSpeech';
import useVoiceCapture, { blobToBase64 } from '../../../hooks/useVoiceCapture.js';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../context/AuthContext';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../../../components/ui';

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
const wordTone = { correct: ['ok', 'Clear'], close: ['warn', 'Close'], incorrect: ['error', 'Different'], missed: ['error', 'Missed'] };

// What was measured from the voice itself: speed, pauses, pitch movement, loudness movement.
function VoiceStats({ voice }) {
  const t = voice?.timing;
  const pitch = describePitch(voice?.pitch?.variationSemitones);
  const loud = describeLoudness(voice?.loudness?.variationDb);
  const tiles = [
    t && { key: 'speed', label: 'Speed', value: t.wordsPerMinute !== null ? `${t.wordsPerMinute} words/min` : `${t.spokenSeconds}s spoken`, reading: describePace(t.pace), tone: t.pace === 'natural' ? 'ok' : t.pace ? 'warn' : 'info' },
    t && { key: 'pauses', label: 'Pauses', value: t.pauseCount === 0 ? 'No pauses' : `${t.pauseCount} pause${t.pauseCount > 1 ? 's' : ''}`, reading: t.longPauseCount > 0 ? `Longest ${t.longestPause}s` : t.pauseCount ? 'Short' : 'Smooth', tone: t.longPauseCount > 0 ? 'warn' : 'ok' },
    pitch && { key: 'pitch', label: 'Pitch', value: `${voice.pitch.variationSemitones} semitones`, reading: pitch, tone: pitch === 'Lively' ? 'ok' : 'warn' },
    loud && { key: 'loud', label: 'Emphasis', value: `${voice.loudness.variationDb} dB spread`, reading: loud, tone: loud === 'Natural emphasis' ? 'ok' : 'warn' },
  ].filter(Boolean);
  if (!tiles.length) return null;
  return (
    <div>
      <h3 className="card-title" style={{ fontSize: 14 }}>Your voice, measured</h3>
      <ul className="voice-grid plain-grid">
        {tiles.map((x) => (
          <li key={x.key} className="voice-tile">
            <span className="voice-label">{x.label}</span>
            <b>{x.value}</b>
            <span className={`badge badge-${x.tone}`}>{x.reading}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WordRows({ words, extra }) {
  return (
    <div>
      <h3 className="card-title" style={{ fontSize: 14 }}>Word by word</h3>
      <ul className="word-rows plain-grid">
        {words.map((w, i) => {
          const [tone, label] = wordTone[w.status] || scoreTone(w.score);
          return (
            <li key={i} className="word-row">
              <b className="word-target">{w.word}</b>
              <span className="word-heard muted">{w.heard ? `heard “${w.heard}”` : 'not heard'}</span>
              <span className={`badge badge-${tone}`}>{label}{typeof w.score === 'number' ? ` · ${Math.round(w.score)}` : ''}</span>
              {w.note && w.status !== 'correct' && <span className="word-note muted">{w.note}</span>}
            </li>
          );
        })}
      </ul>
      {extra?.length > 0 && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Extra words heard: {extra.join(', ')}</p>}
    </div>
  );
}

export default function Practice() {
  const langs = useLanguages();
  const toast = useToast();
  const { user, refresh } = useAuth();
  const [lang, setLang] = useState(user?.profile?.targetLanguages?.[0] || 'en');
  const [level, setLevel] = useState('beginner');
  const [phrases, setPhrases] = useState([]);
  const [idx, setIdx] = useState(0);
  const [seen, setSeen] = useState(() => new Set());
  const [loadingPhrases, setLoadingPhrases] = useState(false);
  const [phraseError, setPhraseError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [result, setResult] = useState(null);
  const [clip, setClip] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef(Date.now());
  const pending = useRef(false); // a recording is waiting to be analysed
  const capture = useVoiceCapture();

  const phrase = phrases[idx];

  const keepClip = useCallback((next) => {
    setClip((old) => { if (old?.url) URL.revokeObjectURL(old.url); return next; });
  }, []);
  useEffect(() => () => { keepClip(null); }, [keepClip]);

  const analyze = useCallback(async (spoken) => {
    if (!pending.current) return;
    pending.current = false;
    const recorded = await capture.finish();
    keepClip(recorded);
    if (!phrase || (!spoken && !recorded)) return;
    setAnalyzing(true); setAnalysisError('');
    try {
      let data = null;
      if (recorded) {
        try {
          const audio = await blobToBase64(recorded.blob);
          const res = await api.speech.analyzeVoice({ audio, mime: recorded.mime.split(';')[0], language: lang, targetText: phrase.text, transcribedText: spoken || '', metrics: recorded.metrics });
          data = res.data;
        } catch (err) { if (!spoken) throw err; /* voice analysis failed: fall back to checking the words */ }
      }
      if (!data) {
        const res = await api.speech.analyze({ targetText: phrase.text, transcribedText: spoken, language: lang });
        data = res.data;
      }
      setResult(data);
      rememberPhrase(phrase.text);
      setSeen((s) => new Set(s).add(idx));
      // A plain word comparison (no AI available) is shown but never saved: it must not count towards progress,
      // history or the leaderboard as if it were a scored pronunciation attempt.
      if (data.ai === false) { toast('AI feedback is unavailable, so this attempt was not saved.', 'info'); return; }
      const words = data.wordsBreakdown || [];
      await api.sessions.create({
        language: lang,
        duration: Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)),
        accuracy: data.overallAccuracy,
        wordsAttempted: words.length || phrase.text.split(/\s+/).length,
        wordsCorrect: words.filter((w) => w.score >= 70).length,
        transcript: data.heard || spoken,
        feedback: (data.suggestions || []).join(' '),
      });
      refresh().catch(() => {});
    } catch (err) {
      setAnalysisError(err.message);
      toast(err.message, 'error');
    } finally { setAnalyzing(false); }
  }, [phrase, idx, lang, toast, refresh, capture, keepClip]);

  const speech = useSpeech(langBcp(lang), { onFinal: analyze });

  // A fresh, random set every time: the server is told which phrases were practised recently so it does not repeat them.
  const loadPhrases = useCallback(async () => {
    setLoadingPhrases(true); setResult(null); setAnalysisError(''); setPhraseError(''); keepClip(null);
    try {
      const res = await api.phrases.daily({ lang, difficulty: level, refresh: '1', avoid: avoidParam(loadRecent()) });
      const list = res.data.phrases || [];
      setPhrases(list);
      setSeen(new Set());
      setIdx(pickUnseen(list.length, new Set()) ?? 0);
    } catch (err) { setPhraseError(err.message); }
    finally { setLoadingPhrases(false); }
  }, [lang, level, keepClip]);

  useEffect(() => { loadPhrases(); }, [loadPhrases]);

  // recording timer
  const recording = speech.listening || capture.recording;
  useEffect(() => {
    if (!recording) { setSeconds(0); return undefined; }
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Speech recognition can end without any words (nothing recognised): the recording is still analysed.
  const analyzeRef = useRef(analyze);
  analyzeRef.current = analyze;
  const wasListening = useRef(false);
  useEffect(() => {
    if (wasListening.current && !speech.listening) {
      const t = setTimeout(() => { if (pending.current) analyzeRef.current(''); }, 900);
      wasListening.current = false;
      return () => clearTimeout(t);
    }
    wasListening.current = speech.listening;
    return undefined;
  }, [speech.listening]);

  const toggleMic = async () => {
    if (recording) { if (speech.supported && speech.listening) speech.stop(); else analyze(''); return; }
    setResult(null); setAnalysisError(''); keepClip(null);
    startedAt.current = Date.now();
    pending.current = true;
    await capture.start();
    if (speech.supported) speech.start();
    else if (!capture.supported) pending.current = false;
  };
  const retry = () => { setResult(null); setAnalysisError(''); speech.setTranscript(''); keepClip(null); };
  const next = () => {
    const picked = pickUnseen(phrases.length, new Set([...seen, idx]));
    if (picked === null) { loadPhrases(); return; } // every phrase in this set has been practised: get a new random set
    setIdx(picked); retry();
  };

  // one state at a time, in words
  const state = loadingPhrases ? 'loading' : recording ? 'recording' : analyzing ? 'processing' : analysisError || speech.error || capture.error ? 'error' : result ? 'success' : 'idle';
  const stateText = {
    loading: 'Loading phrases…', recording: `Recording… ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`,
    processing: 'Analysing your voice…', error: 'Something went wrong', success: 'Done — see your feedback', idle: 'Tap the microphone and read the phrase aloud',
  }[state];

  const metrics = result ? [['Overall', result.overallAccuracy], ['Fluency', result.fluencyScore], ['Intonation', result.intonationScore], ['Stress', result.stressScore], ['Clarity', result.clarityScore]].filter(([, v]) => typeof v === 'number') : [];
  const canRecord = speech.supported || capture.supported;
  const left = phrases.length - seen.size;

  return (
    <>
      <PageHeader icon={Mic} title="Practice" subtitle="Say a phrase out loud. We listen to your voice, not just your words, and tell you how it sounded."
        actions={(
          <>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="p-lang" className="sr-only">Language</label>
              <select id="p-lang" className="select" value={lang} onChange={(e) => setLang(e.target.value)}>{langs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select>
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
          {loadingPhrases ? <LoadingState label="Finding new phrases…" />
            : phraseError ? <EmptyState icon={XCircle} title="Couldn’t load phrases" action={<button className="btn btn-outline btn-sm" onClick={() => loadPhrases()}>Try again</button>}>{phraseError}</EmptyState>
            : phrase ? (
              <div className="phrase-box">
                {phrase.topic && <StatusBadge status="info">{phrase.topic}</StatusBadge>}
                <div className="phrase-text" lang={lang}>“{phrase.text}”</div>
                {phrase.phonetic && <div className="mono muted" style={{ fontSize: 14 }}>{phrase.phonetic}</div>}
                {phrase.translation && phrase.translation.trim().toLowerCase() !== phrase.text.trim().toLowerCase() && <div className="muted">{phrase.translation}</div>}
                {phrase.tip && <div className="muted" style={{ fontSize: 13 }}>Tip: {phrase.tip}</div>}
              </div>
            ) : <EmptyState icon={Mic} title="No phrases available">Try a different language or level.</EmptyState>}

          <div className="row between wrap" style={{ marginTop: 14 }}>
            <div className="row">
              {canSpeak() && <button className="btn btn-outline btn-sm" disabled={!phrase} onClick={() => speak(phrase.text, langBcp(lang))}><Volume2 size={15} aria-hidden="true" /> Listen</button>}
              <button className="btn btn-outline btn-sm" disabled={loadingPhrases} onClick={() => loadPhrases()}><RefreshCw size={15} aria-hidden="true" /> New phrases</button>
            </div>
            <span className="muted" style={{ fontSize: 13 }} aria-live="polite">{phrases.length ? (seen.size === 0 ? `${phrases.length} random phrases in this set` : `${left} phrase${left === 1 ? '' : 's'} left in this set`) : ''}</span>
          </div>

          <div className="recorder">
            <Waveform active={state === 'recording'} />
            {canRecord ? (
              <button className={`mic-btn ${recording ? 'rec' : ''}`} onClick={toggleMic} disabled={!phrase || analyzing} aria-label={recording ? 'Stop recording' : 'Start recording'}>
                {recording ? <Square size={30} aria-hidden="true" /> : <Mic size={34} aria-hidden="true" />}
              </button>
            ) : <div className="error-text" role="alert">Recording isn’t supported in this browser. Use Chrome or Edge.</div>}
            <div role="status" aria-live="polite" className={`rec-state ${state}`}>{stateText}</div>
          </div>

          <div className="transcript" aria-live="polite" aria-label="What we heard">
            {speech.transcript || <span className="muted">What we hear will appear here.</span>}
          </div>
          {(analysisError || speech.error || capture.error) && <div className="error-text" role="alert" style={{ marginTop: 10 }}>{analysisError || speech.error || capture.error}</div>}

          <div className="row" style={{ marginTop: 14, gap: 8 }}>
            <button className="btn btn-outline" onClick={retry} disabled={!result && !analysisError && !speech.transcript}><RotateCcw size={16} aria-hidden="true" /> Retry</button>
            <button className="btn btn-primary" onClick={next} disabled={phrases.length < 1 || loadingPhrases}>Next phrase <SkipForward size={16} aria-hidden="true" /></button>
          </div>
        </section>

        <section className="card" aria-labelledby="fb-h" aria-busy={analyzing}>
          <h2 id="fb-h" className="card-title">Your feedback</h2>
          {analyzing && <LoadingState label="Listening to your recording…" />}
          {!analyzing && !result && <EmptyState icon={Mic} title="No feedback yet">Record the phrase. You will get your accuracy, how fast you spoke, your pauses, pitch and emphasis, word-by-word results and tips.</EmptyState>}
          {!analyzing && result && (
            <div className="stack">
              {result.ai === false && (
                <p className="notice" role="status"><b>Word match only.</b> The voice analysis is unavailable right now, so this only compares the words we heard with the phrase. It was <b>not saved</b> to your progress.</p>
              )}
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

              {result.heard && <p className="heard-line"><span className="muted">We heard</span> “{result.heard}”</p>}
              {result.summary && <p className="summary-line">{result.summary}</p>}
              {clip?.url && <div className="recording-row"><span className="muted">Your recording</span><audio controls preload="metadata" src={clip.url} aria-label="Play your recording" /></div>}

              <VoiceStats voice={result.voice} />
              {!result.voice && <p className="muted" style={{ fontSize: 13 }}>Voice measurements need a microphone recording. Only the words were checked this time.</p>}

              {result.wordsBreakdown?.length > 0 && <WordRows words={result.wordsBreakdown} extra={result.extraWords} />}

              {result.suggestions?.length > 0 && (
                <div className="tip-box">
                  <h3 className="card-title" style={{ fontSize: 14 }}>Tips to improve</h3>
                  <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>{result.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}
              <p className="muted" style={{ fontSize: 12 }}>Speed, pauses, pitch and emphasis are measured from your recording. Fluency, intonation and stress scores are estimates from those measurements, not a judgement of individual sounds.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
