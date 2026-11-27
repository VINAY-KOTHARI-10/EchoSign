import { memo, useEffect, useState } from 'react';
import { Ban, Check, CornerUpLeft, Download, FileText, HandHeart, Heart, Laugh, Sparkles, SmilePlus, ThumbsUp, Trash2 } from 'lucide-react';
import * as api from '../../../api';
import { REACTIONS, REACTION_LABEL, formatSize, myReaction, reactionSummary, roleTag, senderColor } from '../../../lib/chatUtils.js';

const ICON = { like: ThumbsUp, love: Heart, laugh: Laugh, wow: Sparkles, thanks: HandHeart };
export const ReactionIcon = ({ kind, size = 16 }) => { const I = ICON[kind] || ThumbsUp; return <I size={size} aria-hidden="true" />; };

// Pictures are protected by the sign-in, so they are fetched with it and shown from a local address (kept for the session).
const pictureCache = new Map();
function usePicture(id, enabled) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    let p = pictureCache.get(id);
    if (!p) { p = api.chat.attachment(id).then(({ blob }) => URL.createObjectURL(blob)); pictureCache.set(id, p); }
    p.then((u) => { if (live) setUrl(u); }).catch(() => { pictureCache.delete(id); if (live) setFailed(true); });
    return () => { live = false; };
  }, [id, enabled]);
  return { url, failed };
}

const saveFile = async (file) => {
  const { blob, filename } = await api.chat.attachment(file.id);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename || file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

function AttachmentView({ file }) {
  const { url, failed } = usePicture(file.id, file.isImage);
  const [saving, setSaving] = useState(false);
  if (file.isImage) {
    if (failed) return <p className="wa-text wa-deleted">This picture could not be loaded.</p>;
    return url
      ? <a className="wa-image" href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><img src={url} alt={file.name} /></a>
      : <div className="wa-image wa-image-wait" role="status" aria-label="Loading picture" />;
  }
  return (
    <button type="button" className="wa-file" disabled={saving} onClick={async (e) => { e.stopPropagation(); setSaving(true); try { await saveFile(file); } finally { setSaving(false); } }} aria-label={`Download ${file.name}`}>
      <FileText size={26} aria-hidden="true" />
      <span><b>{file.name}</b><small>PDF · {formatSize(file.size)}</small></span>
      <Download size={18} aria-hidden="true" />
    </button>
  );
}

const timeOf = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// One message in the Community chat: sender name on the first of a run, a quote when it is a reply, the text (or "deleted"),
// the time with a tick for your own, reaction pills, and a small action bar (reply, react, delete your own).
function ChatMessage({ msg, mine, first, meId, selected, picking, confirming, onSelect, onReply, onPick, onReact, onAskDelete, onDelete, onJump }) {
  const reactions = reactionSummary(msg.reactions, meId);
  const chosen = myReaction(msg.reactions, meId);
  const quote = msg.replyTo;
  const tag = roleTag(msg.user?.role);
  return (
    <div id={`msg-${msg.id}`} className={`wa-msg ${mine ? 'me' : 'them'} ${first ? 'first' : ''} ${selected ? 'is-selected' : ''}`}>
      <div className="wa-bubble" onClick={() => onSelect(selected ? null : msg.id)}>
        {first && !mine && (
          <div className="wa-sender"><span style={{ color: senderColor(msg.user?.id) }}>{msg.user?.username}</span>{tag && <span className="wa-role">{tag}</span>}</div>
        )}
        {first && mine && tag && <div className="wa-sender mine"><span className="wa-role">{tag}</span></div>}
        {quote && (
          <button type="button" className="wa-quote" onClick={(e) => { e.stopPropagation(); onJump(quote.id); }} aria-label={`Go to the message from ${quote.user?.username}`}>
            <b style={{ color: senderColor(quote.user?.id) }}>{quote.user?.id === meId ? 'You' : quote.user?.username}</b>
            <span>{quote.deleted ? 'This message was deleted' : (quote.content || quote.attachmentLabel || '')}</span>
          </button>
        )}
        {msg.deleted
          ? <p className="wa-text wa-deleted"><Ban size={14} aria-hidden="true" /> This message was deleted</p>
          : (
            <>
              {msg.attachment && <AttachmentView file={msg.attachment} />}
              {msg.content && <p className="wa-text">{msg.content}</p>}
            </>
          )}
        <span className="wa-meta">
          <time dateTime={new Date(msg.createdAt).toISOString()}>{timeOf(msg.createdAt)}</time>
          {mine && !msg.deleted && <Check size={14} aria-label="Sent" />}
        </span>
      </div>

      {reactions.length > 0 && (
        <div className="wa-reactions" role="group" aria-label="Reactions">
          {reactions.map((r) => (
            <button key={r.kind} type="button" className={`wa-react-pill ${r.mine ? 'mine' : ''}`} onClick={() => onReact(msg.id, r.kind)} aria-pressed={r.mine} aria-label={`${REACTION_LABEL[r.kind]}, ${r.count}`}>
              <ReactionIcon kind={r.kind} size={14} /><span>{r.count}</span>
            </button>
          ))}
        </div>
      )}

      {!msg.deleted && (
        <div className="wa-actions" role="group" aria-label="Message actions">
          <button type="button" className="wa-act" onClick={(e) => { e.stopPropagation(); onReply(msg); }} aria-label="Reply"><CornerUpLeft size={16} aria-hidden="true" /></button>
          <button type="button" className="wa-act" onClick={(e) => { e.stopPropagation(); onPick(picking ? null : msg.id); }} aria-label="React" aria-expanded={picking}><SmilePlus size={16} aria-hidden="true" /></button>
          {mine && <button type="button" className="wa-act danger" onClick={(e) => { e.stopPropagation(); onAskDelete(confirming ? null : msg.id); }} aria-label="Delete"><Trash2 size={16} aria-hidden="true" /></button>}
        </div>
      )}

      {picking && (
        <div className="wa-picker" role="group" aria-label="Choose a reaction">
          {REACTIONS.map((k) => (
            <button key={k} type="button" className={`wa-pick ${chosen === k ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); onReact(msg.id, k); }} aria-label={REACTION_LABEL[k]} aria-pressed={chosen === k} title={REACTION_LABEL[k]}>
              <ReactionIcon kind={k} size={20} />
            </button>
          ))}
        </div>
      )}

      {confirming && (
        <div className="wa-confirm" role="alertdialog" aria-label="Delete this message for everyone?">
          <span>Delete for everyone?</span>
          <button type="button" className="btn btn-danger-soft btn-sm" onClick={(e) => { e.stopPropagation(); onDelete(msg.id); }}>Delete</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); onAskDelete(null); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

export default memo(ChatMessage);
