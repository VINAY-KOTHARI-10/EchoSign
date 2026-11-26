import { LETTER_ART, PALM, ROTATE_ABOUT, WRIST } from '../../../lib/handArt';

const SIZE = 100; // viewBox is SIZE x SIZE
const OUTLINE = 'var(--violet-dark)';
const FILL = 'var(--violet-light)';

// One shape, drawn twice: a slightly wider dark stroke, then the light fill on top. Drawing each shape on its own
// (in order) gives every finger and the thumb a visible edge where they overlap.
function Shape({ s }) {
  const [kind] = s;
  if (kind === 'L') {
    const [, x1, y1, x2, y2, w] = s;
    return (
      <g strokeLinecap="round" fill="none">
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={OUTLINE} strokeWidth={w + 3} />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={FILL} strokeWidth={w} />
      </g>
    );
  }
  if (kind === 'O') {
    const [, cx, cy, rx, ry, w] = s;
    return (
      <g fill="none">
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} stroke={OUTLINE} strokeWidth={w + 3} />
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} stroke={FILL} strokeWidth={w} />
      </g>
    );
  }
  const [, d, w] = s; // 'P': a curved stroke
  return (
    <g strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d={d} stroke={OUTLINE} strokeWidth={w + 3} />
      <path d={d} stroke={FILL} strokeWidth={w} />
    </g>
  );
}

// ASL letter hand shape. The drawings are hand-made (see lib/handArt.js), simplified for orientation, and are not
// official ASL illustrations; the written description beside each letter is the reference.
export default function HandDiagram({ letter, size = 84, label = true }) {
  const art = LETTER_ART[letter];
  if (!art) return null;
  const turn = art.rotate ? `rotate(${art.rotate} ${ROTATE_ABOUT.cx} ${ROTATE_ABOUT.cy})` : undefined;
  const plain = !art.shapes.some(([k]) => k === 'O' || k === 'P') || art.shapes.some(([k]) => k === 'L');
  const showPalm = !['C', 'O'].includes(letter) && plain;

  return (
    <figure className="hand-fig" style={{ width: size }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={size} height={size} role="img" aria-label={`ASL letter ${letter}`}>
        <g transform={turn}>
          {showPalm && (
            <>
              <rect x={WRIST.x} y={WRIST.y} width={WRIST.w} height={WRIST.h} rx={WRIST.r} fill={FILL} stroke={OUTLINE} strokeWidth="3" />
              <rect x={PALM.x} y={PALM.y} width={PALM.w} height={PALM.h} rx={PALM.r} fill={FILL} stroke={OUTLINE} strokeWidth="3" />
              <rect x={PALM.x + 1.5} y={PALM.y + 8} width={PALM.w - 3} height={PALM.h - 10} rx={PALM.r - 2} fill={FILL} />
            </>
          )}
          {art.shapes.map((s, i) => <Shape key={i} s={s} />)}
        </g>
        {art.motion && (
          <path d={art.motion === 'Z' ? 'M70 12 L90 12 L70 30 L90 30' : 'M84 10 L84 30 Q84 40 72 38'} fill="none" stroke="var(--amber)" strokeWidth="2.5" strokeDasharray="3 3" strokeLinecap="round" />
        )}
      </svg>
      {label && <figcaption>{letter}{art.motion ? ' ⤳' : ''}</figcaption>}
    </figure>
  );
}
