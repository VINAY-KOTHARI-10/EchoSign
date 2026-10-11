import { LETTER_POSES, letterHand } from '../lib/handModel';

const FINGERS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const PALM = [0, 1, 5, 9, 13, 17];
const SIZE = 100; // viewBox is SIZE x SIZE
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Schematic drawing of an ASL letter hand shape, generated from the same hand model the recogniser is
// tested against. Straight fingers are drawn in full, bent fingers as a curve, and curled fingers as a
// short folded stub. These are simplified diagrams for orientation, not official ASL illustrations.
export default function HandDiagram({ letter, size = 84, label = true }) {
  const pose = LETTER_POSES[letter];
  if (!pose) return null;
  const pts = letterHand(letter, 1);
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const k = (SIZE - 24) / Math.max(maxX - minX, maxY - minY);
  const at = (p) => [12 + (p.x - minX) * k + ((SIZE - 24) - (maxX - minX) * k) / 2, 12 + (p.y - minY) * k + ((SIZE - 24) - (maxY - minY) * k) / 2];
  const P = (i) => at(pts[i]).map((v) => v.toFixed(1)).join(' ');

  const finger = ([a, b, c, d], i) => {
    const chain = dist(pts[a], pts[b]) + dist(pts[b], pts[c]) + dist(pts[c], pts[d]);
    const r = dist(pts[a], pts[d]) / chain; // 1 = straight
    const width = i === 0 ? 7 : 6;
    if (r >= 0.88) return <path key={i} d={`M${P(a)} L${P(b)} L${P(c)} L${P(d)}`} fill="none" stroke="var(--violet)" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />;
    if (r >= 0.62) return <path key={i} d={`M${P(a)} Q${P(c)} ${P(d)}`} fill="none" stroke="var(--violet)" strokeWidth={width} strokeLinecap="round" />;
    return <path key={i} d={`M${P(a)} L${P(d)}`} fill="none" stroke="var(--violet-dark)" strokeWidth={width + 2} strokeLinecap="round" opacity={0.85} />;
  };

  return (
    <figure className="hand-fig" style={{ width: size }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={size} height={size} role="img" aria-label={`ASL letter ${letter}`}>
        <path d={`M${PALM.map(P).join(' L')} Z`} fill="var(--violet-light)" stroke="var(--violet-3)" strokeWidth="1.5" strokeLinejoin="round" />
        {FINGERS.map(finger)}
        {pose.motion && (
          <path d={pose.motion === 'Z' ? 'M70 12 L90 12 L70 30 L90 30' : 'M84 10 L84 30 Q84 40 72 38'} fill="none" stroke="var(--amber)" strokeWidth="2.5" strokeDasharray="3 3" strokeLinecap="round" />
        )}
      </svg>
      {label && <figcaption>{letter}{pose.motion ? ' ⤳' : ''}</figcaption>}
    </figure>
  );
}
