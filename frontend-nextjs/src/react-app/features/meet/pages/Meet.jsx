import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useMeet from '../hooks/useMeet';
import useMeetSign from '../hooks/useMeetSign';
import useSpeech from '../../../hooks/useSpeech';
import { useAuth } from '../../../context/AuthContext';
import { useLanguages } from '../../../lib/languages';
import { langBcp } from '../../../lib';
import { PageHeader, StatusBadge } from '../../../components/ui';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

// One person's video. The picture is attached to the element here; muted for your own tile so you do not hear yourself.
function VideoTile({ stream, name, you, state, caption, videoRef, camOff }) {
  const own = useRef(null);
  const ref = videoRef || own;
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null; }, [stream, ref]);
  return (
    <figure className={`meet-tile ${you ? 'you' : ''}`}>
      <video ref={ref} autoPlay playsInline muted={you} className={you ? 'mirror' : ''} aria-label={you ? 'Your camera' : `${name}'s camera`} />
      {!stream && <div className="meet-wait">{state === 'failed' ? 'Connection failed' : 'Connecting…'}</div>}
      {camOff && <div className="meet-wait">Camera off</div>}
      <figcaption className="meet-name">{you ? 'You' : name}{state && !you && state !== 'connected' ? <span className="muted"> · {state}</span> : null}</figcaption>
      {caption && <p className="meet-caption" aria-live="polite">{caption.text}</p>}
    </figure>
  );
}

function Lobby({ onJoin, error, busy }) {
  const [code, setCode] = useState('');
  const secure = typeof window !== 'undefined' ? window.isSecureContext : true;
  return (
    <>
      {!secure && (
        <p className="notice notice-warn" role="alert"><b>This page is not secure.</b> Browsers block the camera on plain http addresses. Open the https address of the computer running EchoSign (see “Using a hotspot”), and accept the certificate warning once.</p>
      )}
      {busy && <p className="notice" role="status">Starting… if your browser asks, choose <b>Allow</b> for the camera and microphone.</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="grid grid-2 meet-lobby">
        <section className="card" aria-labelledby="start-h">
          <h2 id="start-h" className="card-title">Start a meeting</h2>
          <p className="muted">You get a code. Share it with the people you want to meet; they join with it.</p>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => onJoin(newCode())}>{busy ? 'Starting…' : 'Start meeting'}</button>
        </section>
        <form className="card" aria-labelledby="join-h" onSubmit={(e) => { e.preventDefault(); if (code.trim().length === 6) onJoin(code); }}>
          <h2 id="join-h" className="card-title">Join a meeting</h2>
          <div className="field">
            <label htmlFor="meet-code">Meeting code</label>
            <input id="meet-code" className="input mono code-input" maxLength={6} autoComplete="off" placeholder="ABC123" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy || code.trim().length !== 6}>Join meeting</button>
        </form>
      </div>
      <section className="card" aria-labelledby="hot-h" style={{ marginTop: 'var(--gap)' }}>
        <h2 id="hot-h" className="card-title">Using a hotspot</h2>
        <ol className="meet-steps">
          <li>Turn on the hotspot on a phone, or use any Wi-Fi everyone shares, and connect every device to it.</li>
          <li>On every device, open EchoSign as usual and sign in. The hotspot's data connection is used to reach EchoSign.</li>
          <li>One person starts a meeting and shares the code; the others join with it. Their video then goes directly between the devices on the hotspot.</li>
          <li>Running your own copy on a laptop instead? Start it with <span className="mono">npm run lan</span>: it prints an address like <span className="mono">https://192.168.43.10:5000</span> to open on every device (accept the certificate warning once).</li>
        </ol>
        <p className="muted" style={{ fontSize: 14 }}>Sign recognition runs in each browser, so the camera picture is never uploaded. Up to four people can meet at once. Some hotspots stop devices from talking to each other; if people cannot see each other, try another hotspot or the same Wi-Fi.</p>
      </section>
    </>
  );
}

function Room({ meet }) {
  const { user } = useAuth();
  const langs = useLanguages();
  const localRef = useRef(null);
  const [typed, setTyped] = useState('');
  const [spokenLang, setSpokenLang] = useState(user?.profile?.nativeLanguage || 'en');
  const [signOn, setSignOn] = useState(false);
  const [micText, setMicText] = useState(false);

  const sign = useMeetSign({
    videoRef: localRef,
    onWord: (w) => meet.say(w, 'letter'),
    onPhrase: (p) => meet.say(p, 'phrase'),
  });
  const speech = useSpeech(langBcp(spokenLang), { keepAlive: true, onResult: ({ text, isFinal }) => { if (isFinal && text.trim()) meet.say(text, 'speech'); } });

  const toggleSign = () => { if (signOn) { sign.stop(); setSignOn(false); } else { setSignOn(true); sign.start(); } };
  const toggleSpeech = () => { if (micText) { speech.stop(); setMicText(false); } else { setMicText(true); speech.start(); } };
  const send = (e) => { e.preventDefault(); meet.say(typed, 'typed'); setTyped(''); };

  // The latest subtitle from each person, shown on their tile.
  const latest = useMemo(() => {
    const byName = {};
    [...meet.lines].reverse().forEach((l) => { if (l.kind !== 'system' && !byName[l.who] && Date.now() - l.at < 12000) byName[l.who] = l; });
    return byName;
  }, [meet.lines]);

  const peerIds = Object.keys(meet.peers);
  const logRef = useRef(null);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [meet.lines]);

  return (
    <div className="meet-room">
      <div className="meet-main">
        <div className={`meet-grid n${peerIds.length + 1}`}>
          <VideoTile you stream={meet.localStream} name="You" videoRef={localRef} caption={latest.You} camOff={!meet.camOn} />
          {peerIds.map((id) => <VideoTile key={id} stream={meet.peers[id].stream} name={meet.peers[id].username} state={meet.peers[id].state} caption={latest[meet.peers[id].username]} />)}
        </div>
        {peerIds.length === 0 && <p className="notice" role="status">Waiting for others. Share the code <b className="mono">{meet.code}</b> with them.</p>}

        <div className="control-row" role="group" aria-label="Meeting controls">
          <button className={`btn ${meet.micOn ? 'btn-outline' : 'btn-danger-soft'}`} onClick={meet.toggleMic} aria-pressed={!meet.micOn}>{meet.micOn ? 'Mute microphone' : 'Unmute microphone'}</button>
          <button className={`btn ${meet.camOn ? 'btn-outline' : 'btn-danger-soft'}`} onClick={meet.toggleCam} aria-pressed={!meet.camOn}>{meet.camOn ? 'Turn camera off' : 'Turn camera on'}</button>
          <button className={`btn ${signOn ? 'btn-primary' : 'btn-outline'}`} onClick={toggleSign} aria-pressed={signOn}>{signOn ? 'Sign recognition on' : 'Sign recognition'}</button>
          <button className={`btn ${micText ? 'btn-primary' : 'btn-outline'}`} onClick={toggleSpeech} aria-pressed={micText} disabled={!speech.supported}>{micText ? 'Speech to text on' : 'Speech to text'}</button>
          <button className="btn btn-danger-soft" onClick={meet.leave}>Leave</button>
        </div>
        {micText && (
          <label className="setting" style={{ maxWidth: 320 }}>I am speaking
            <select className="select" value={spokenLang} onChange={(e) => setSpokenLang(e.target.value)}>{langs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select>
          </label>
        )}
        {speech.error && <p className="error-text" role="alert">{speech.error}</p>}

        {signOn && (
          <section className="card" aria-labelledby="sign-h">
            <h2 id="sign-h" className="card-title">Your signing</h2>
            {sign.status === 'loading' && <p role="status">Loading hand tracking…</p>}
            {sign.status === 'error' && <p className="error-text" role="alert">{sign.error}</p>}
            {sign.status === 'running' && (
              <div className="meet-sign" role="status" aria-live="polite">
                <div><span className="muted">Letter</span><b className="sign-big">{sign.letter ? sign.letter.letter : '–'}</b></div>
                <div><span className="muted">Spelling</span><b className="mono">{sign.spelling || '–'}</b></div>
                <div><span className="muted">Phrase</span><b>{sign.phrase ? sign.phrase.text : '–'}</b>{sign.phrase && sign.phrase.progress < 1 && <small className="muted"> hold it…</small>}</div>
              </div>
            )}
            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Fingerspell a word and pause: it is sent as text. Twelve phrase signs (Hello, Help, Thank you, Yes, No…) are sent as sentences. The picture never leaves your device, and recognition can be wrong: others see exactly what is sent.</p>
          </section>
        )}
      </div>

      <aside className="meet-side card" aria-label="Conversation">
        <div className="row between"><h2 className="card-title" style={{ marginBottom: 0 }}>Conversation</h2><StatusBadge status="ok">Code {meet.code}</StatusBadge></div>
        <ul className="meet-log" ref={logRef} aria-live="polite">
          {meet.lines.length === 0 && <li className="muted">Subtitles from signs and speech appear here, for everyone.</li>}
          {meet.lines.map((l) => (
            <li key={l.id} className={l.kind === 'system' ? 'sys' : ''}>
              <b>{l.mine ? 'You' : l.who}</b>{l.kind !== 'system' && l.kind !== 'typed' ? <span className="muted"> · {l.kind === 'letter' ? 'spelled' : l.kind === 'phrase' ? 'sign' : 'spoken'}</span> : null}
              <div>{l.text}</div>
            </li>
          ))}
        </ul>
        <form onSubmit={send} className="row" style={{ gap: 8 }}>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type a message" aria-label="Type a message" maxLength={300} />
          <button className="btn btn-primary" disabled={!typed.trim()}>Send</button>
        </form>
      </aside>
    </div>
  );
}

export default function Meet() {
  const meet = useMeet();
  const join = useCallback((code) => meet.join(code), [meet]);
  return (
    <>
      <PageHeader title="Sign Meet" subtitle="Video meetings with live subtitles for signs and speech. Works over a phone hotspot: the video goes straight between your devices." />
      {meet.status === 'joined' ? <Room meet={meet} /> : <Lobby onJoin={join} error={meet.error} busy={meet.status === 'starting'} />}
    </>
  );
}
