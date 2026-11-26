import { useState } from 'react';
import { BarChart3, Hand, Mic, Radio, Users } from 'lucide-react';

const ROLE_TEXT = { HOST: 'Teacher', CAPTIONER: 'Captioner', STUDENT: 'Student' };
// Soft, readable avatar colours picked from the name, so the same person always has the same colour.
const PALETTE = [['#ede6ff', '#4b2cd6'], ['#dbeafe', '#1d4ed8'], ['#fce7f3', '#be185d'], ['#dcfce7', '#15803d'], ['#fef3c7', '#92400e'], ['#e0f2fe', '#0369a1']];
const colourOf = (name = '') => PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

// Live numbers from the room: how many students are connected and whether anyone is captioning right now.
export function ClassOverview({ participants, captionsActive, live }) {
  const students = participants.filter((p) => p.role !== 'HOST').length;
  return (
    <section className="card rail-card" aria-labelledby="ov-h">
      <h2 id="ov-h" className="rail-title"><BarChart3 size={18} aria-hidden="true" /> Class overview</h2>
      <div className="overview-tiles">
        <div className="ov">
          <Users size={22} className="ov-icon" aria-hidden="true" />
          <div className="num">{students}</div>
          <small>{students === 1 ? 'Student connected' : 'Students connected'}</small>
        </div>
        <div className="ov mint">
          <Radio size={22} className="ov-icon" aria-hidden="true" />
          <div className="num" style={{ fontSize: 24 }}>{!live ? 'Offline' : captionsActive ? 'Live' : 'Idle'}</div>
          <small>{captionsActive ? 'Captions active' : live ? 'Waiting for speech' : 'Not connected'}</small>
        </div>
      </div>
    </section>
  );
}

// Who is in the class right now, with a mic icon for whoever is speaking and a hand for raised hands.
export function Participants({ participants, hands, speakingIds, meId, onViewAll }) {
  const [all, setAll] = useState(false);
  const shown = all ? participants : participants.slice(0, 5);
  const handIds = new Set(hands.map((h) => h.userId));
  const sorted = [...shown].sort((a, b) => (a.role === 'HOST' ? -1 : 0) - (b.role === 'HOST' ? -1 : 0));

  return (
    <section className="card rail-card" aria-labelledby="part-h">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h2 id="part-h" className="rail-title" style={{ marginBottom: 0 }}><Users size={18} aria-hidden="true" /> Participants ({participants.length})</h2>
        {participants.length > 5 && <button className="rail-link" onClick={() => (onViewAll ? onViewAll() : setAll((v) => !v))}>{all ? 'Show less' : 'View all'}</button>}
      </div>
      {participants.length === 0 ? <p className="muted" style={{ fontSize: 14, padding: '10px 0' }}>Nobody is connected yet.</p> : (
        <ul className="part-list">
          {sorted.map((p) => {
            const [bg, fg] = colourOf(p.username);
            const speaking = speakingIds.has(p.userId);
            return (
              <li key={p.userId}>
                <span className="part-avatar" style={{ background: bg, color: fg }} aria-hidden="true">{(p.username || '?')[0].toUpperCase()}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="part-name" style={{ display: 'block' }}>{p.username}{p.userId === meId && ' (you)'}</span>
                  <span className="part-role">{ROLE_TEXT[p.role] || 'Student'}</span>
                </span>
                {handIds.has(p.userId) ? <span className="part-icon" title="Hand raised" role="img" aria-label="Hand raised"><Hand size={20} /></span>
                  : speaking ? <span className="part-icon" title="Speaking" role="img" aria-label="Speaking"><Mic size={20} /></span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
