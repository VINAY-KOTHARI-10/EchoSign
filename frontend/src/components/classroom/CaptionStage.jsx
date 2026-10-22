// CaptionStage - real-time caption display component
import { ArrowDown, Pencil } from 'lucide-react';
import { SOURCE_ICON, splitHighlights } from '../../lib/captions';
import { useToast } from '../../context/ToastContext';

function Highlighted({ text, keywords }) {
  return splitHighlights(text, keywords).map((p, i) => (p.hit ? <mark key={i} className="kw">{p.text}</mark> : <span key={i}>{p.text}</span>));
}

// The live caption board: keyword highlights, translations, inline corrections, reading-pace queue.
export default function CaptionStage({
  captions, interim, draft, prefs, theme, fontCss, keywords, translations, translationKey,
  canEdit, onEdit, focusId, waiting, emptyText, draftName,
}) {
  const toast = useToast();
  const boxRef = useRef(null);
  const endRef = useRef(null);
  const [stick, setStick] = useState(true); // follow new captions unless the reader scrolled up
  const [editing, setEditing] = useState(null); // { id, text }
  const [flashId, setFlashId] = useState(null);

  useEffect(() => { if (stick) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [captions, interim, draft, stick]);

  const onScroll = () => {
    const el = boxRef.current;
    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  // Jump from the transcript search to a caption.
  useEffect(() => {
    if (!focusId) return undefined;
    const el = boxRef.current?.querySelector(`[data-id="${focusId}"]`);
    if (!el) return undefined;
    setStick(false);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(focusId);
    const t = setTimeout(() => setFlashId(null), 2200);
    return () => clearTimeout(t);
  }, [focusId]);

  const save = async () => {
    const { id, text } = editing;
    setEditing(null);
    try { await onEdit(id, text); } catch (err) { toast(err.message, 'error'); }
  };

  const style = {
    background: theme.bg, color: theme.fg, fontSize: prefs.size, fontFamily: fontCss,
    lineHeight: prefs.lineHeight, letterSpacing: `${prefs.letterSpacing}em`,
  };

  return (
    <div className="caption-wrap">
      <div ref={boxRef} className="caption-stage" style={style} onScroll={onScroll} role="log" aria-live="polite" aria-label="Live captions">
        {captions.length === 0 && !interim && !draft && <div style={{ opacity: 0.6, fontSize: 18 }}>{emptyText}</div>}

        {captions.map((c) => {
          const tr = translations?.[translationKey(c)];
          return (
            <div key={c.id} data-id={c.id} className={`caption-line ${flashId === c.id ? 'flash' : ''}`}>
              {prefs.showNames && <span className="caption-who">{c.speakerName}{SOURCE_ICON[c.source]}</span>}
              {editing?.id === c.id ? (
                <form className="row" onSubmit={(e) => { e.preventDefault(); save(); }}>
                  <input className="input" autoFocus value={editing.text} maxLength={500} style={{ fontSize: 18 }}
                    onChange={(e) => setEditing({ id: c.id, text: e.target.value })} onKeyDown={(e) => e.key === 'Escape' && setEditing(null)} aria-label="Corrected caption" />
                  <button className="btn btn-primary btn-sm" type="submit">Save</button>
                  <button className="btn btn-ghost btn-sm" type="button" style={{ color: 'inherit' }} onClick={() => setEditing(null)}>Cancel</button>
                </form>
              ) : (
                <>
                  <span style={c.partial ? { opacity: 0.85 } : undefined}><Highlighted text={c.text} keywords={keywords} /></span>
                  {c.editedAt && <span className="caption-edited" title={`Original: ${c.originalText}`}>✎ corrected</span>}
                  {canEdit?.(c) && !c.partial && (
                    <button className="caption-edit" onClick={() => setEditing({ id: c.id, text: c.text })} aria-label="Correct this caption"><Pencil size={14} /></button>
                  )}
                </>
              )}
              {tr && editing?.id !== c.id && <span className="caption-tr">{tr}</span>}
            </div>
          );
        })}

        {interim && !prefs.paceWpm && (
          <div className="caption-line" style={{ opacity: 0.6 }}>
            {prefs.showNames && <span className="caption-who">{interim.speakerName}{SOURCE_ICON[interim.source]}</span>}
            {interim.text}…
          </div>
        )}
        {draft && (
          <div className="caption-line" style={{ opacity: 0.6 }}>
            {prefs.showNames && <span className="caption-who">{draftName}</span>}{draft.split(' ').slice(-25).join(' ')}…
          </div>
        )}
        {waiting > 0 && <div className="caption-wait">{waiting} more {waiting === 1 ? 'caption' : 'captions'} waiting at your reading pace</div>}
        <div ref={endRef} />
      </div>
      {!stick && (
        <button className="btn btn-primary btn-sm jump-latest" onClick={() => { setStick(true); }}>
          <ArrowDown size={15} /> Jump to latest
        </button>
      )}
    </div>
  );
}

