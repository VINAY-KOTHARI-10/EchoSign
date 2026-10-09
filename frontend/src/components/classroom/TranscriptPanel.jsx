import { useMemo, useState } from 'react';
import { Circle, Download, FileText, Printer, Search, Square } from 'lucide-react';
import {
  SOURCE_ICON, buildSrt, buildTranscriptText, downloadText, printHtml, safeName, splitHighlights, timeOf, transcriptHtml,
} from '../../lib/captions';

// Searchable transcript with jump-to-moment, exports (TXT / SRT / PDF) and local audio recording.
export default function TranscriptPanel({ room, captions, onJump, canRecord, recorder }) {
  const [query, setQuery] = useState('');
  const [speaker, setSpeaker] = useState('');

  const speakers = useMemo(() => [...new Set(captions.map((c) => c.speakerName))], [captions]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return captions.filter((c) => (!speaker || c.speakerName === speaker) && (!q || c.text.toLowerCase().includes(q)));
  }, [captions, query, speaker]);

  const base = safeName(`${room.title}-${room.code}`);
  const rec = recorder.result;

  return (
    <div className="stack">
      <div className="card">
        <div className="row between wrap" style={{ marginBottom: 12 }}>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Transcript <span className="muted" style={{ fontWeight: 500 }}>({captions.length})</span></h2>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn btn-outline btn-sm" disabled={!captions.length} onClick={() => downloadText(`${base}.txt`, buildTranscriptText(room, captions))}><FileText size={15} /> Text</button>
            <button className="btn btn-outline btn-sm" disabled={!captions.length} onClick={() => downloadText(`${base}.srt`, buildSrt(captions), 'application/x-subrip')}><Download size={15} /> Subtitles (.srt)</button>
            <button className="btn btn-outline btn-sm" disabled={!captions.length} onClick={() => printHtml(room.title, transcriptHtml(room, captions))}><Printer size={15} /> PDF / Print</button>
          </div>
        </div>

        <div className="row wrap" style={{ gap: 10, marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--muted)' }} />
            <input className="input" style={{ paddingLeft: 38 }} placeholder="Search the transcript" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the transcript" />
          </div>
          <select className="select" style={{ width: 'auto' }} value={speaker} onChange={(e) => setSpeaker(e.target.value)} aria-label="Filter by speaker">
            <option value="">Everyone</option>{speakers.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        {(query || speaker) && <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{rows.length} of {captions.length} captions match</p>}

        <div className="transcript-list">
          {rows.length === 0 ? <div className="empty">{captions.length ? 'No captions match.' : 'Nothing has been captioned yet.'}</div> : rows.map((c) => (
            <button key={c.id} className="transcript-row" onClick={() => onJump(c.id)} title="Show in the live captions">
              <span className="mono muted">{timeOf(c.createdAt)}</span>
              <span><b>{c.speakerName}{SOURCE_ICON[c.source]}</b>{' '}
                {splitHighlights(c.text, [query]).map((p, i) => (p.hit ? <mark key={i} className="hit">{p.text}</mark> : <span key={i}>{p.text}</span>))}
                {c.editedAt && <span className="caption-edited"> ✎</span>}</span>
            </button>
          ))}
        </div>
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
                {recorder.recording ? <><Square size={16} /> Stop recording</> : <><Circle size={16} /> Start recording</>}
              </button>
              {recorder.recording && <span className="chip chip-stop">● Recording</span>}
            </div>
          )}
          {recorder.error && <div className="error-text" style={{ marginTop: 10 }}>{recorder.error}</div>}
          {rec && !recorder.recording && (
            <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
              <audio controls src={rec.url} style={{ maxWidth: '100%' }} />
              <a className="btn btn-outline btn-sm" href={rec.url} download={`${base}.webm`}><Download size={15} /> Audio</a>
              <button className="btn btn-outline btn-sm" onClick={() => downloadText(`${base}-synced.srt`, buildSrt(captions, rec.startedAt), 'application/x-subrip')}><Download size={15} /> Subtitles synced to the audio</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
