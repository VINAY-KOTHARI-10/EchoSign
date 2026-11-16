import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

const POINTS = [
  'Live captions for every lecture',
  'Sign and speech in one classroom',
  'Private: sign video stays on your device',
];

// Two-column auth screen: brand panel (hidden on small screens) + the form card.
export default function AuthLayout({ children }) {
  return (
    <div className="auth-split">
      <a className="skip-link" href="#auth-main">Skip to the form</a>
      <aside className="auth-brand">
        <Logo />
        <h2>Classrooms everyone can follow.</h2>
        <p>Sign Language &amp; Speech-to-Text Classroom Assistant</p>
        <ul className="auth-points">{POINTS.map((t) => <li key={t}>{t}</li>)}</ul>
      </aside>
      <main id="auth-main" className="auth-main">
        <ThemeToggle className="auth-theme" />
        <div className="auth-mobile-logo"><Logo /></div>
        <div className="card auth-card">{children}</div>
      </main>
    </div>
  );
}
