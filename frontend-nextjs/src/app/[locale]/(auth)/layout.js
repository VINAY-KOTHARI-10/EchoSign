// The sign-in and create-account screen: the same split layout as the EchoSign React app (purple brand panel + form card).
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import Logo from '@/components/Logo';

const POINTS = [
  'Live captions for every lecture',
  'Sign and speech in one classroom',
  'Private: sign video stays on your device',
];

export default async function AuthLayout({ children, params }) {
  const { locale } = await params;
  return (
    <div className="auth-split">
      <a className="skip-link" href="#content">Skip to the form</a>
      <aside className="auth-brand">
        <Logo href={`/${locale}`} />
        <h2>Classrooms everyone can follow.</h2>
        <p>Sign Language &amp; Speech-to-Text Classroom Assistant</p>
        <ul className="auth-points">{POINTS.map((t) => <li key={t}>{t}</li>)}</ul>
      </aside>
      <main id="content" className="auth-main">
        <div className="auth-top">
          <Link href={`/${locale}`} className="btn btn-ghost btn-sm auth-back"><ArrowLeft size={16} aria-hidden="true" /> Back to home</Link>
        </div>
        <div className="auth-mobile-logo"><Logo href={`/${locale}`} /></div>
        <div className="card auth-card">{children}</div>
      </main>
    </div>
  );
}
