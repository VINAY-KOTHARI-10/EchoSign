import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Logo from '../../../components/Logo';

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
        <div className="auth-top">
          <Link to="/" className="btn btn-ghost btn-sm auth-back"><ArrowLeft size={16} aria-hidden="true" /> Back to home</Link>
        </div>
        <div className="auth-mobile-logo"><Logo /></div>
        <div className="card auth-card">{children}</div>
      </main>
    </div>
  );
}
