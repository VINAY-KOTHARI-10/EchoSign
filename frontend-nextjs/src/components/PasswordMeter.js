'use client';

// Compact strength bar (Weak / Fair / Good / Strong) and the four rules, ticked as they are met.
// The same component and styles as the EchoSign React site. Status is written out, not shown by colour alone.
import { Check, Circle } from 'lucide-react';
import { passwordStrength } from '@/lib/password';

export default function PasswordMeter({ password, email }) {
  const { level, label, checks } = passwordStrength(password, email);
  if (!password) return null;
  return (
    <div className="pw-meter" aria-live="polite">
      <div className="pw-head">
        <div className="pw-bars" aria-hidden="true">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= level ? `on s${level}` : ''} />)}</div>
        <b className="pw-label">{label}</b>
      </div>
      <ul className="pw-rules">
        {checks.map((c) => (
          <li key={c.id} className={c.ok ? 'ok' : ''}>
            {c.ok ? <Check size={13} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />}
            <span>{c.label}{c.ok && <span className="sr-only"> (done)</span>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
