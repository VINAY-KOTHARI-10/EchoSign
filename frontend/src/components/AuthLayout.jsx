import { Captions, Hand, ShieldCheck } from 'lucide-react';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

const POINTS = [
  [Captions, 'Live captions for every lecture'],
  [Hand, 'Sign and speech in one classroom'],
  [ShieldCheck, 'Private: sign video stays on your device'],
];

// Two-column auth screen: brand panel (hidden on small screens) + the form card.
export default function AuthLayout({ children }) {
  return (
    <div className="auth-split">
      <a className="skip-link" href="#auth-main">Skip to the form</a>
      <aside className="auth-brand" aria-hidden="false">
        <svg className="auth-waves" viewBox="0 0 600 260" preserveAspectRatio="none" aria-hidden="true"><path d="M0 170C90 120 170 110 260 150s170 60 340-40v150H0z" fill="rgba(255,255,255,0.08)" /><path d="M0 210c100-60 190-40 280 0s210 30 320-50v100H0z" fill="rgba(255,255,255,0.10)" /></svg>
        <Logo />
        <h2>Classrooms everyone can <span className="swoosh">follow.</span></h2>
        <p>Sign Language &amp; Speech-to-Text Classroom Assistant</p>
        <ul>{POINTS.map(([Icon, t]) => <li key={t}><span className="pt-icon"><Icon size={20} aria-hidden="true" /></span> {t}</li>)}</ul>
      </aside>
      <main id="auth-main" className="auth-main">
        <ThemeToggle className="auth-theme" />
        <div className="auth-mobile-logo"><Logo /></div>
        <div className="card auth-card">{children}</div>
      </main>
    </div>
  );
}
