import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Download, FileText, Printer, Search, Square } from 'lucide-react';
import * as api from '../../../api';
import { SOURCE_ICON, buildSrt, downloadText, parseClock, safeName, splitHighlights, timeOf } from '../../../lib/captions';
import { useToast } from '../../../context/ToastContext';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui';

const PAGE = 50;
const SOURCES = [['', 'All sources'], ['SPEECH', 'Speech'], ['SIGN', 'Sign'], ['TEXT', 'Typed']];

// The COMPLETE transcript, loaded from the server in pages (so a long lecture is never cut off), with search,
// speaker and source filters, jump-to-time, exports and local audio recording.
export default function TranscriptPanel({ room, liveCaptions, onJump, canRecord, recorder }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [source, setSource] = useState('');
  const [at, setAt] = useState('');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const seq = useRef(0);

  const filtered = Boolean(query.trim() || speaker || source || at);
  const params = useMemo(() => {
    const secs = parseClock(at);
    return { q: query.trim(), speaker, source, at: secs || undefined, limit: PAGE };
  }, [query, speaker, source, at]);

  const load = useCallback(async (more = false, from = null) => {
    const mine = ++seq.current;
    if (!more) setStatus('loading');
    try {
      const res = await api.classrooms.transcript(room.code, { ...params, cursor: more ? from : undefined });
      if (mine !== seq.current) return; // a newer search replaced this one
      setItems((list) => (more ? [...list, ...res.data.captions] : res.data.captions));
      setCursor(res.data.nextCursor); setTotal(res.data.total); setStatus('ready'); setError('');
    } catch (err) { if (mine === seq.current) { setStatus('error'); setError(err.message); } }
  }, [room.code, params]);

  // Search as you type (after a short pause).
  useEffect(() => { const t = setTimeout(() => load(false), 300); return () => clearTimeout(t); }, [load]);

  // New live captions appear at the end without reloading, when nothing is filtered and the last page is showing.
  const live = useMemo(() => {
    if (filtered || cursor || !liveCaptions?.length) return [];
    const have = new Set(items.map((c) => c.id));
    return liveCaptions.filter((c) => !have.has(c.id));
  }, [filtered, cursor, liveCaptions, items]);
  const rows = live.length ? [...items, ...live] : items;

  const speakers = useMemo(() => {
    const map = new Map();
    [...items, ...(liveCaptions || [])].forEach((c) => { if (c.speakerId) map.set(c.speakerId, c.speakerName); });
    return [...map.entries()];
  }, [items, liveCaptions]);

  const base = safeName(`${room.title}-${room.code}`);
  const exportAs = async (format) => {
    setBusy(format);
    try {
      const { blob, filename } = await api.classrooms.exportFile(room.code, format);
      if (format === 'html') {
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank');
        if (!w) { toast('Allow pop-ups to print the transcript', 'error'); return; }
        w.addEventListener('load', () => w.print());
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename || `${base}.${format}`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(''); }
  };

  const rec = recorder.result;
  const badTime = at.trim() && parseClock(at) === null;

  return (
    <div className="stack">
      <div className="card">
        <div className="row between wrap" style={{ marginBottom: 12 }}>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Transcript <span className="muted" style={{ fontWeight: 500 }}>({total})</span></h2>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn btn-outline btn-sm" disabled={!total || busy === 'txt'} onClick={() => exportAs('txt')}><FileText size={15} aria-hidden="true" /> {busy === 'txt' ? 'Preparing…' : 'Text'}</button>
            <button className="btn btn-outline btn-sm" disabled={!total || busy === 'srt'} onClick={() => exportAs('srt')}><Download size={15} aria-hidden="true" /> {busy === 'srt' ? 'Preparing…' : 'Subtitles (.srt)'}</button>
            <button className="btn btn-outline btn-sm" disabled={!total || busy === 'html'} onClick={() => exportAs('html')}><Printer size={15} aria-hidden="true" /> {busy === 'html' ? 'Preparing…' : 'PDF / Print'}</button>
          </div>
        </div>

        <div className="row wrap" style={{ gap: 10, marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 14, top: 15, color: 'var(--muted)' }} />
            <input className="input" style={{ paddingLeft: 38 }} placeholder="Search the whole transcript" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the transcript" />
          </div>
          <select className="select" style={{ width: 'auto' }} value={speaker} onChange={(e) => setSpeaker(e.target.value)} aria-label="Filter by speaker">
            <option value="">Everyone</option>{speakers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select className="select" style={{ width: 'auto' }} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Filter by source">
            {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <div>
            <label className="sr-only" htmlFor="jump-time">Jump to time (minutes:seconds)</label>
            <input id="jump-time" className="input mono" style={{ width: 110 }} placeholder="Jump to 12:30" value={at} onChange={(e) => setAt(e.target.value)} aria-invalid={Boolean(badTime)} aria-describedby={badTime ? 'jump-err' : undefined} />
            {badTime && <span id="jump-err" className="error-text" style={{ fontSize: 12 }}>Use mm:ss, like 12:30</span>}
          </div>
        </div>
        {filtered && <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{total} {total === 1 ? 'caption matches' : 'captions match'}{at && !badTime ? ` · starting at ${at}` : ''}</p>}

        {status === 'loading' && !items.length ? <LoadingState label="Loading the transcript…" />
          : status === 'error' ? <ErrorState message={error} onRetry={() => load(false)} />
          : rows.length === 0 ? <EmptyState icon={FileText} title={filtered ? 'No captions match' : 'Nothing has been captioned yet'}>{filtered ? 'Try different words or clear the filters.' : 'Captions appear here as soon as someone speaks, signs or types.'}</EmptyState> : (
            <>
              <div className="transcript-list">
                {rows.map((c) => (
                  <button key={c.id} className="transcript-row" onClick={() => onJump?.(c.id)} title="Show in the live captions">
                    <span className="mono muted">{timeOf(c.createdAt)}</span>
                    <span><b>{c.speakerName}{SOURCE_ICON[c.source]}</b>{' '}
                      {splitHighlights(c.text, [query.trim()]).map((p, i) => (p.hit ? <mark key={i} className="hit">{p.text}</mark> : <span key={i}>{p.text}</span>))}
                      {c.editedAt && <span className="caption-edited"> (corrected)</span>}</span>
                  </button>
                ))}
              </div>
              <div className="row between wrap" style={{ marginTop: 12 }}>
                <span className="muted" style={{ fontSize: 13 }} role="status">Showing {rows.length} of {total}</span>
                {cursor && <button className="btn btn-outline btn-sm" onClick={() => load(true, cursor)}>Load more</button>}
              </div>
            </>
          )}
      </div>

      {canRecord && (
        <div className="card">
          <h2 className="card-title">Record this class</h2>
          <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>
            Records your microphone on this device only (nothing is uploaded). Afterwards you can download the audio and a subtitle file that lines up with it, for review or for sharing with students who missed class.
          </p>
          {!recorder.supported ? <div className="error-text">Recording isn’t supported in this browser.</div> : (
            <div className="row wrap">
              <button className={`btn ${recorder.recording ? 'btn-danger' : 'btn-primary'}`} onClick={recorder.recording ? recorder.stop : recorder.start}>
                {recorder.recording ? <><Square size={16} aria-hidden="true" /> Stop recording</> : <><Circle size={16} aria-hidden="true" /> Start recording</>}
              </button>
              {recorder.recording && <span className="chip chip-stop">● Recording</span>}
            </div>
          )}
          {recorder.error && <div className="error-text" style={{ marginTop: 10 }}>{recorder.error}</div>}
          {rec && !recorder.recording && (
            <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
              <audio controls src={rec.url} style={{ maxWidth: '100%' }} />
              <a className="btn btn-outline btn-sm" href={rec.url} download={`${base}.webm`}><Download size={15} aria-hidden="true" /> Audio</a>
              <button className="btn btn-outline btn-sm" onClick={() => downloadText(`${base}-synced.srt`, buildSrt(liveCaptions || items, rec.startedAt), 'application/x-subrip')}><Download size={15} aria-hidden="true" /> Subtitles synced to the audio</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
