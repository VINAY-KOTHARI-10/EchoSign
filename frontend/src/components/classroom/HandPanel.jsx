import { Hand } from 'lucide-react';

// Raise-hand button for everyone; the queue (with "lower") for the teacher and captioners.
export default function HandPanel({ hands, userId, canModerate, isHost, live, onRaise, onLower }) {
  const position = hands.findIndex((h) => h.userId === userId);
  const raised = position >= 0;

  return (
    <div className="card">
      <h2 className="card-title"><Hand size={16} style={{ display: 'inline', verticalAlign: -2 }} /> Raise your hand
        {hands.length > 0 && <span className="chip chip-amber" style={{ marginLeft: 8 }}>{hands.length} waiting</span>}</h2>

      {!canModerate || raised ? (
        <button className={`btn btn-block ${raised ? 'btn-outline' : 'btn-primary'}`} disabled={!live} onClick={() => onRaise(!raised)} aria-pressed={raised}>
          ✋ {raised ? `Lower my hand (you are #${position + 1})` : 'Raise hand'}
        </button>
      ) : isHost ? (
        <p className="muted" style={{ fontSize: 14 }}>Students who raise a hand appear here, in order. Lower a hand once you’ve called on them.</p>
      ) : (
        <button className="btn btn-outline btn-block" disabled={!live} onClick={() => onRaise(true)}>✋ Raise my own hand</button>
      )}

      {canModerate && (
        <div style={{ marginTop: 14 }}>
          {hands.length === 0 ? <p className="muted" style={{ fontSize: 14 }}>No hands raised.</p> : hands.map((h, i) => (
            <div key={h.userId} className="row hand-row">
              <span className="rank">{i + 1}</span>
              <b style={{ flex: 1 }}>{h.username}</b>
              <button className="btn btn-outline btn-sm" onClick={() => onLower(h.userId)}>Lower</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
