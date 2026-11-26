import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Bell, CalendarClock, Copy, Download, HelpCircle, Maximize2, Mic, MicOff, Pause, Play, RefreshCw, Share2, Square, WifiOff } from 'lucide-react';
import * as api from '../../../api';
import { langBcp, langName } from '../../../lib';
import { useLanguages } from '../../../lib/languages';
import { alertReason } from '../../../lib/captions';
import useCaptionRoom from '../hooks/useCaptionRoom';
import useDisplayPrefs, { FONTS, THEMES } from '../../../hooks/useDisplayPrefs';
import usePacedCaptions from '../hooks/usePacedCaptions';
import useRecorder from '../../../hooks/useRecorder';
import useSignRecognition from '../../signs/hooks/useSignRecognition';
import useSpeech, { SPEECH_PRIVACY } from '../../../hooks/useSpeech';
import useTranslation, { translationKey } from '../hooks/useTranslation';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { useUiPrefs } from '../../../hooks/useUiPrefs';
import AskPanel from '../components/AskPanel';
import CaptionStage from '../components/CaptionStage';
import DisplayPanel from '../components/DisplayPanel';
import HandPanel from '../components/HandPanel';
import InsightsPanel from '../components/InsightsPanel';
import { ClassOverview, Participants } from '../components/RailPanels';
import SettingsPanel from '../components/SettingsPanel';
import { SignCamera, SignGuide, SignPreview } from '../components/SignPanel';
import SummaryPanel from '../components/SummaryPanel';
import TranscriptPanel from '../components/TranscriptPanel';
import TypePanel from '../components/TypePanel';
import { LoadingState, Modal, StatusBadge, TabPanel, Tabs, useConfirm } from '../../../components/ui';

const AUTO_SEND_MS = 3500;
// "hello world" -> "Hello world"
const sentenceCase = (w) => { const t = w.trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };

const ALERT_TEXT = { name: 'Your name was mentioned', word: 'One of your alert words was said', question: 'A question was asked' };

export default function ClassroomRoom() {
  const langs = useLanguages();
  const { code } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const stageRef = useRef(null);

  const [prefs, updatePrefs, resetPrefs] = useDisplayPrefs();
  const [tab, setTab] = useState('live');
  const [focusId, setFocusId] = useState(null);
  const [alertInfo, setAlertInfo] = useState(null);
  const [paused, setPaused] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const resumeRef = useRef({ mic: false, cam: false });
  const { ui } = useUiPrefs();
  const [announcement, setAnnouncement] = useState(''); // read out by screen readers when the preference is on

  // ── Alerts: flash / vibrate when something addressed to me is captioned ──
  const onIncoming = useCallback((cap) => {
    if (cap.speakerId === user.id) return;
    if (ui.announceCaptions) setAnnouncement(`${cap.speakerName}: ${cap.text}`);
    const words = prefs.alerts.words.split(',').map((w) => w.trim()).filter(Boolean);
    const reason = alertReason(cap.text, { username: prefs.alerts.name ? user.username : '', words, question: prefs.alerts.question });
    if (!reason) return;
    setAlertInfo({ reason, text: cap.text, who: cap.speakerName, at: Date.now() });
    if (prefs.alerts.vibrate && navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }, [prefs.alerts, user.id, user.username, ui.announceCaptions]);
  useEffect(() => {
    if (!alertInfo) return undefined;
    const t = setTimeout(() => setAlertInfo(null), 4000);
    return () => clearTimeout(t);
  }, [alertInfo]);

  const rm = useCaptionRoom(code, { userId: user.id, onIncoming, onNotice: toast });
  const { room, meta, captions, live, ended } = rm;

  // Saved language preference (Profile): translate into the person's native language by default, once.
  const nativeApplied = useRef(false);
  useEffect(() => {
    if (nativeApplied.current || !room?.language) return;
    nativeApplied.current = true;
    let hasSaved = true;
    try { hasSaved = localStorage.getItem('lw_cc_prefs') !== null; } catch { /* storage unavailable: leave settings alone */ }
    const native = user.profile?.nativeLanguage;
    if (hasSaved || !native || native === room.language) return;
    const name = langs.find((l) => l.code === native)?.name;
    if (name) updatePrefs({ translateTo: name });
  }, [room?.language, user.profile?.nativeLanguage, updatePrefs]);
  const customGestures = room?.customGestures || [];

  const paced = usePacedCaptions(captions, prefs.paceWpm, Boolean(room));
  const { translations, statusOf: translationStatus, summary: translationSummary, error: translationError, retry: retryTranslation } = useTranslation(code, captions, prefs.translateTo);
  const recorder = useRecorder();

  // ── Speech → text ────────────────────────────────────────────────────────
  // `myDraft` is the words still being spoken. Once the browser finalises a sentence it is sent as a caption
  // and the draft is cleared, so the same words are never shown twice.
  const [myDraft, setMyDraft] = useState('');
  const speech = useSpeech(langBcp(room?.language || 'en'), {
    keepAlive: true,
    onResult: ({ text, isFinal }) => {
      if (!text) return;
      if (isFinal) { setMyDraft(''); rm.sendCaption(text, 'SPEECH'); }
      else { setMyDraft(text); rm.sendInterim(text, 'SPEECH'); }
    },
  });
  useEffect(() => { if (!speech.listening) setMyDraft(''); }, [speech.listening]);

  // ── Sign → text ──────────────────────────────────────────────────────────
  const [signMode, setSignMode] = useState('letters'); // 'letters' | 'phrases'
  const [word, setWord] = useState('');                // letters spelled so far
  const [autoSend, setAutoSend] = useState(true);
  const onLetter = useCallback(({ letter, replacePrevious }) => {
    setWord((w) => (replacePrevious ? w.slice(0, -1) : w) + letter);
  }, []);
  const sign = useSignRecognition({
    mode: signMode, customGestures, onLetter,
    onGesture: (g) => {
      rm.sendCaption(g.phrase, 'SIGN');
      if (g.id === 'Pointing_Up') rm.raiseHand(true); // "I have a question" also raises a hand
    },
  });
  const sendWord = useCallback(() => {
    if (!word.trim()) return;
    rm.sendCaption(sentenceCase(word), 'SIGN');
    setWord('');
  }, [word, rm]);
  useEffect(() => {
    if (!autoSend || !word.trim()) return undefined;
    const t = setTimeout(sendWord, AUTO_SEND_MS);
    return () => clearTimeout(t);
  }, [word, autoSend, sendWord]);

  // ── Pause / resume / restart ─────────────────────────────────────────────
  const pause = () => {
    resumeRef.current = { mic: speech.listening, cam: sign.status === 'running' || sign.status === 'loading' };
    speech.stop(); sign.stop(); setPaused(true);
  };
  const resume = () => {
    if (resumeRef.current.mic) speech.start();
    if (resumeRef.current.cam) sign.start();
    setPaused(false);
  };
  // Restart = stop and start the microphone again (useful when the browser's recogniser stalls).
  const restart = () => {
    setPaused(false);
    if (speech.listening) { speech.stop(); setTimeout(() => speech.start(), 500); } else speech.start();
  };

  const theme = THEMES.find((t) => t.id === prefs.theme) || THEMES[0];
  const copy = async (text, msg) => {
    try { await navigator.clipboard.writeText(text); toast(msg, 'success'); } catch { toast(text, 'info'); }
  };
  const fullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.().catch(() => toast('Full screen is not available here', 'error'));
  };

  const endClass = async () => {
    const ok = await confirm({ title: 'End this class?', body: 'Captioning stops for everyone. The transcript stays available and you can reopen the class later.', confirmLabel: 'End class', danger: true });
    if (!ok) return;
    try { speech.stop(); sign.stop(); await api.classrooms.end(code); rm.setEnded(true); setPaused(false); }
    catch (err) { toast(err.message, 'error'); }
  };

  const downloadTranscript = async () => {
    try {
      const { blob, filename } = await api.classrooms.exportFile(code, 'txt');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      // A connection that drops part-way through a long transcript surfaces as a bare network error; say what it means.
      toast(/network|fetch|aborted|interrupted|failed to/i.test(err.message || '') ? 'The download was interrupted, so the file is incomplete. Please try again.' : err.message, 'error');
    }
  };

  const onEdit = async (id, text) => {
    const res = await api.classrooms.editCaption(code, id, text);
    rm.replaceCaption(res.data.caption);
  };

  const saveGestures = async (list) => {
    const res = await api.classrooms.update(code, { customGestures: list });
    rm.setRoom((r) => ({ ...r, customGestures: res.data.classroom.customGestures }));
  };

  const jumpTo = (id) => { setTab('live'); setFocusId(null); setTimeout(() => setFocusId(id), 60); };
  const showHands = () => { setTab('live'); setTimeout(() => document.getElementById('hand-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120); };

  const studentCount = rm.participants.filter((p) => p.role !== 'HOST').length;
  const tabs = useMemo(() => [
    { id: 'live', label: 'Live Caption' },
    { id: 'transcript', label: 'Transcript' },
    { id: 'summary', label: 'Summary' },
    { id: 'ask', label: 'Ask' },
    ...(meta.canModerate ? [{ id: 'students', label: `Students (${studentCount})` }] : []),
    ...(meta.isHost ? [{ id: 'settings', label: 'Settings' }] : []),
  ], [meta.canModerate, meta.isHost, studentCount]);

  if (rm.error) {
    return (
      <div className="card center" style={{ maxWidth: 480, margin: '60px auto' }} role="alert">
        <h1 style={{ fontSize: 22 }}>Can’t open this class</h1><p className="muted" style={{ margin: '8px 0 18px' }}>{rm.error}</p>
        <Link to="/classroom" className="btn btn-primary">Back to classroom</Link>
      </div>
    );
  }
  if (!room) return <LoadingState label="Opening class…" />;

  const scheduledSoon = room.scheduledAt && new Date(room.scheduledAt) > new Date();
  const when = new Date(room.scheduledAt || room.createdAt);
  const dateText = when.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const timeText = when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  // ── status strip ──
  const speechOn = speech.listening && !paused;
  const signOn = sign.status === 'running' && !paused;
  const signCurrent = sign.current;
  const mic = !speech.supported ? { tone: 'off', text: 'Not supported' } : paused ? { tone: 'warn', text: 'Paused' }
    : speech.error ? { tone: 'error', text: 'Unavailable' } : speechOn ? { tone: 'ok', text: 'Active' } : { tone: 'off', text: 'Off' };
  const cam = paused ? { tone: 'warn', text: 'Paused' } : sign.status === 'error' ? { tone: 'error', text: 'Camera unavailable' }
    : sign.status === 'loading' ? { tone: 'info', text: 'Starting…' } : signOn ? { tone: 'info', text: signCurrent ? `Detected ${signCurrent.letter || signCurrent.phrase}` : 'Detecting…' } : { tone: 'off', text: 'Off' };
  const inputs = speechOn && signOn ? ['Both Inputs Active', 'Speech + Sign → Text'] : speechOn ? ['Speech Input Active', 'Speech → Text']
    : signOn ? ['Sign Input Active', 'Sign → Text'] : ['No inputs active', 'Start captioning or the camera'];
  const capturing = speech.listening || sign.status === 'running' || sign.status === 'loading';
  const speakingIds = new Set(rm.participants.filter((p) => rm.isSpeaking(p.userId)).map((p) => p.userId));
  if (speechOn) speakingIds.add(user.id);

  return (
    <>
      {alertInfo && prefs.alerts.flash && <div className="alert-flash" aria-hidden="true" key={alertInfo.at} />}
      {alertInfo && (
        <div className="alert-banner" role="alert">
          <b>{ALERT_TEXT[alertInfo.reason]}</b><span>{alertInfo.who}: “{alertInfo.text}”</span>
        </div>
      )}

      <button className="btn btn-ghost btn-sm back-link" onClick={() => navigate('/classroom')}><ArrowLeft size={16} aria-hidden="true" /> All classes</button>

      {/* ── Header ───────────────────────────────────────────── */}
      <header className="room-head">
        <div className="id">
          <div style={{ minWidth: 0 }}>
            <h1>{room.title}</h1>
            <div className="room-meta">
              <span className="row" style={{ gap: 6 }}><CalendarClock size={15} aria-hidden="true" /> {dateText}</span>
              <span className="sep" aria-hidden="true">•</span>
              <span>{scheduledSoon ? 'Starts' : 'Started'} {timeText}</span>
              <span className="sep" aria-hidden="true">•</span>
              <span>Teacher: <b style={{ color: 'var(--ink)' }}>{room.host?.username || '—'}</b></span>
              <span className="sep" aria-hidden="true">•</span>
              <span>{langName(room.language)}</span>
              <span className="code-pill">Class Code: <b>{room.code}</b>
                <button onClick={() => copy(room.code, 'Class code copied')} aria-label={`Copy class code ${room.code.split('').join(' ')}`}><Copy size={15} aria-hidden="true" /></button></span>
            </div>
          </div>
        </div>
        <div className="room-actions">
          <span className={`pill-live ${live ? '' : 'off'}`} role="status">
            {live ? <><span className="pulse-dot" aria-hidden="true" /> Live Class</> : ended ? 'Class ended' : rm.connection === 'offline' ? 'Offline' : rm.connection === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
          </span>
          {meta.role === 'CAPTIONER' && <StatusBadge status="ok">Captioner</StatusBadge>}
          <button className="icon-btn" onClick={showHands} aria-label={rm.hands.length ? `${rm.hands.length} raised ${rm.hands.length === 1 ? 'hand' : 'hands'}. Show` : 'No raised hands'}>
            <Bell size={20} aria-hidden="true" />{rm.hands.length > 0 && <span className="dot-badge" aria-hidden="true" />}
          </button>
          <button className="icon-btn" onClick={() => setHelpOpen(true)} aria-label="Help for this class"><HelpCircle size={20} aria-hidden="true" /></button>
          {meta.isHost && !ended
            ? <button className="btn btn-primary btn-lg" onClick={endClass}><Square size={16} aria-hidden="true" /> End Class</button>
            : <button className="btn btn-outline btn-lg" onClick={() => navigate('/classroom')}>{ended ? 'Close' : 'Leave class'}</button>}
        </div>
      </header>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
      {!ended && rm.connection !== 'online' && (
        <div className="conn-banner" role="status">
          <WifiOff size={18} aria-hidden="true" />
          <span>{rm.connection === 'offline' ? 'You are offline. Captions you send are kept and will be sent when you reconnect.'
            : rm.connection === 'reconnecting' ? 'Reconnecting to the class. Captions you send are kept and retried.' : 'Connecting to the class…'}
            {rm.pending > 0 ? ` (${rm.pending} waiting to send)` : ''}</span>
        </div>
      )}
      {!ended && rm.connection === 'online' && rm.pending > 0 && <div className="conn-banner info" role="status">Sending {rm.pending} {rm.pending === 1 ? 'caption' : 'captions'}…</div>}
      {rm.outbox.pending > 0 && !rm.outbox.persistent && (
        <div className="conn-banner" role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{rm.outbox.storageProblem === 'quota' ? 'This device is out of storage space.' : rm.outbox.storageProblem === 'limit' ? 'Too many captions are waiting.' : 'Captions cannot be saved on this device.'} Captions waiting to send will be lost if you close or refresh this page.</span>
        </div>
      )}
      {rm.outbox.failed.length > 0 && (
        <div className="conn-banner outbox-failed" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <strong>{rm.outbox.failed.length} {rm.outbox.failed.length === 1 ? 'caption was' : 'captions were'} not accepted by the server</strong>
            <ul className="outbox-list">
              {rm.outbox.failed.map((f) => (
                <li key={f.clientId}>
                  <span className="outbox-text">“{f.text.length > 80 ? `${f.text.slice(0, 80)}…` : f.text}”</span>
                  <span className="muted"> {f.error}</span>
                  <button className="btn btn-sm" onClick={() => rm.retryCaption(f.clientId)}>Retry</button>
                  <button className="btn btn-sm" onClick={() => rm.discardCaption(f.clientId)}>Discard</button>
                </li>
              ))}
            </ul>
            {rm.outbox.failed.length > 1 && <button className="btn btn-sm" onClick={rm.clearFailedCaptions}>Discard all</button>}
          </div>
        </div>
      )}
      {!ended && rm.outbox.pending === 0 && rm.outbox.failed.length === 0 && rm.outbox.delivered > 0 && <div className="conn-banner info" role="status">All captions sent.</div>}

      <Tabs variant="pill" tabs={tabs} value={tab} onChange={setTab} label="Classroom sections" idPrefix="room" />

      <TabPanel id="live" active={tab === 'live'} idPrefix="room">
        <div className="room-layout">
          <div className="room-main">
            {/* ── Caption stage ─────────────────────────────── */}
            <section className="stage-card" ref={stageRef} style={{ background: theme.bg, color: theme.fg }} aria-label="Live captions">
              <div className="stage-head">
                <span className="stage-title"><span className={`live-dot ${live ? '' : 'off'}`} aria-hidden="true" /> Live Caption <span>(Real-time)</span></span>
                <div className="stage-tools">
                  <label className="sr-only" htmlFor="stage-lang">Caption language</label>
                  <select id="stage-lang" className="stage-select" value={prefs.translateTo} onChange={(e) => updatePrefs({ translateTo: e.target.value })}>
                    <option value="">{langName(room.language)}</option>
                    {langs.filter((l) => l.code !== room.language).map((l) => <option key={l.code} value={l.name}>Translate: {l.name}</option>)}
                  </select>
                  <button className="stage-btn" onClick={fullscreen} aria-label="Toggle full screen"><Maximize2 size={18} aria-hidden="true" /></button>
                </div>
              </div>
              <div className={`stage-body ${sign.status !== 'idle' && sign.status !== 'error' ? 'with-cam' : ''}`}>
                <CaptionStage
                  captions={paced.visible} waiting={paced.waiting} interim={rm.interim}
                  draft={speech.listening ? myDraft : ''} draftName={user.username}
                  prefs={prefs} theme={theme} fontCss={FONTS[prefs.font]?.css}
                  keywords={room.keywords} translations={translations} translationKey={translationKey} translationStatus={translationStatus} translating={Boolean(prefs.translateTo)}
                  canEdit={(c) => meta.canModerate || c.speakerId === user.id} onEdit={onEdit} focusId={focusId}
                  emptyText={ended ? 'No captions were recorded.' : 'Captions appear here as soon as someone speaks, signs or types.'}
                />
                <SignPreview sign={sign} />
              </div>
            </section>

            {/* ── Status strip ──────────────────────────────── */}
            <section className="status-strip" aria-label="Live status" aria-live="polite">
              <div className="strip-item"><div><b>Microphone</b><span className={mic.tone}>{mic.text}</span></div></div>
              <div className="strip-item"><div><b>Sign recognition</b><span className={cam.tone}>{cam.text}</span></div></div>
              <div className={`strip-item both ${speechOn || signOn ? '' : 'idle'}`}><div><b>{inputs[0]}</b><small>{inputs[1]}</small></div></div>
            </section>
            {speech.error && <div className="error-text" role="alert" style={{ margin: 0 }}>{speech.error}</div>}

            {/* ── Controls ──────────────────────────────────── */}
            <div className="control-row" role="group" aria-label="Class controls">
              {!ended && (speech.listening ? (
                <button className="btn btn-danger-soft" onClick={speech.stop}><MicOff size={18} aria-hidden="true" /> Stop Captioning</button>
              ) : (
                <button className="btn btn-primary" disabled={!live || !speech.supported} onClick={() => { setPaused(false); speech.start(); }}><Mic size={18} aria-hidden="true" /> Start Captioning</button>
              ))}
              {!ended && (paused ? (
                <button className="btn btn-primary" onClick={resume}><Play size={18} aria-hidden="true" /> Resume</button>
              ) : capturing ? (
                <button className="btn btn-outline" onClick={pause}><Pause size={18} aria-hidden="true" /> Pause Captions</button>
              ) : null)}
              {!ended && <button className="btn btn-outline" disabled={!live || !speech.supported} onClick={restart}><RefreshCw size={18} aria-hidden="true" /> Restart</button>}
              <button className="btn btn-outline" onClick={() => copy(`${window.location.origin}/classroom/${room.code}`, 'Join link copied')}><Share2 size={18} aria-hidden="true" /> Share</button>
              <button className="btn btn-outline" disabled={!captions.length} onClick={downloadTranscript}><Download size={18} aria-hidden="true" /> Download Transcript</button>
            </div>

            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              {speech.supported ? SPEECH_PRIVACY : 'This browser cannot turn speech into text. Type captions below, use sign recognition, or open EchoSign in Chrome or Edge.'}
            </p>

            <div className="grid grid-2">
              <TypePanel live={live} onSend={(t) => rm.sendCaption(t, 'TEXT')} />
              <div id="hand-panel"><HandPanel hands={rm.hands} userId={user.id} canModerate={meta.canModerate} isHost={meta.isHost} live={live} onRaise={rm.raiseHand} onLower={rm.lowerHand} /></div>
            </div>
            <DisplayPanel prefs={prefs} update={updatePrefs} reset={resetPrefs} translationError={prefs.translateTo ? translationError : ''} translationSummary={translationSummary} onRetryTranslation={retryTranslation} />
          </div>

          {/* ── Right rail ─────────────────────────────────── */}
          <aside className="room-rail" aria-label="Class details">
            <ClassOverview participants={rm.participants} captionsActive={rm.captionsActive || speechOn} live={live} />
            <Participants participants={rm.participants} hands={rm.hands} speakingIds={speakingIds} meId={user.id} onViewAll={meta.canModerate ? () => setTab('students') : undefined} />
            <SignCamera
              sign={sign} signMode={signMode} setSignMode={setSignMode} word={word} setWord={setWord}
              autoSend={autoSend} setAutoSend={setAutoSend} sendWord={sendWord} live={live} paused={paused}
            />
            <SignGuide sign={sign} signMode={signMode} setSignMode={setSignMode} customGestures={customGestures} canManage={meta.isHost} onSaveGestures={saveGestures} />
          </aside>
        </div>
      </TabPanel>

      <TabPanel id="transcript" active={tab === 'transcript'} idPrefix="room">
        <TranscriptPanel room={room} liveCaptions={captions} onJump={jumpTo} canRecord={meta.canModerate} recorder={recorder} />
      </TabPanel>
      <TabPanel id="summary" active={tab === 'summary'} idPrefix="room">
        <SummaryPanel room={room} setRoom={rm.setRoom} canModerate={meta.canModerate} captionCount={captions.length} />
      </TabPanel>
      <TabPanel id="ask" active={tab === 'ask'} idPrefix="room">
        <AskPanel room={room} captionCount={captions.length} onJump={jumpTo} />
      </TabPanel>
      <TabPanel id="students" active={tab === 'students' && meta.canModerate} idPrefix="room">
        <InsightsPanel room={room} isHost={meta.isHost} active={live} />
      </TabPanel>
      <TabPanel id="settings" active={tab === 'settings' && meta.isHost} idPrefix="room">
        <SettingsPanel room={room} setRoom={rm.setRoom} ended={ended}
          onReopened={() => { rm.setRoom((r) => ({ ...r, active: true })); rm.setEnded(false); }} />
      </TabPanel>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Using this class" wide>
        <ul className="plain-list" style={{ marginTop: 12 }}>
          <li><b>Start Captioning</b> turns on your microphone. Words appear for everyone; use <b>Restart</b> if they stop.</li>
          <li><b>Sign recognition</b> uses your camera (video stays on your device). Fingerspell letters or use the supported gestures.</li>
          <li><b>Type a caption</b> or tap a quick phrase if you can’t speak or sign.</li>
          <li><b>Raise your hand</b> to ask a question; the teacher sees a queue. The bell shows when hands are raised.</li>
          <li>Change text size, colours, font, reading pace and translation under <b>Caption display</b>.</li>
          <li>Share the class code <b className="mono">{room.code}</b> so others can join.</li>
        </ul>
      </Modal>
    </>
  );
}
