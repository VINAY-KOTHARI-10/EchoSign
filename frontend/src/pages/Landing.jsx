import { ArrowRight } from 'lucide-react';
// Landing: what EchoSign is, how a class runs, who it is for, and how it adapts to the reader.
import { Link } from 'react-router-dom';

import Logo from '../components/Logo';
import ThemeToggle from '../components/ThemeToggle';
import { useAuth } from '../context/AuthContext';

const facts = [
  ['One transcript', 'Speech, sign and typed messages land in the same live caption stream and the same saved transcript.'],
  ['Private by design', 'Sign recognition runs in your browser. Camera video never leaves the device.'],
  ['12 languages', 'Speak in one language; each student can read the captions translated into theirs.'],
  ['Any device', 'Works in a modern browser on laptops, tablets and phones. No install needed.'],
];

const steps = [
  ['Start or join', 'A teacher starts a class and shares a six-character code. Students join from any device.'],
  ['Caption everything', 'Speech, signs and typed messages become live captions for the whole room.'],
  ['Review afterwards', 'Download the transcript or subtitles, and generate notes, key terms and a quiz.'],
];

const teachers = [
  'Start a class in seconds and share a code or link',
  'Captions appear for every student as you speak',
  'See who attended and for how long',
  'Correct a caption; the original text is kept',
  'Generate notes, key terms and a quiz from the transcript',
  'Export TXT, SRT subtitles or a printable PDF',
];

const students = [
  'Join with the code your teacher shares',
  'Read along with your own size, font, spacing and colours',
  'Translate captions into your language',
  'Raise a hand or type a question without interrupting',
  'Revisit the full transcript and notes after class',
  'Practise pronunciation and fingerspelling in Practice and Sign Lab',
];

const comforts = ['Caption size', 'Font: Lexend, Atkinson Hyperlegible, system', 'Letter and line spacing', 'Reading pace', 'Light, dark and high contrast', 'Reduced motion'];

function ClassPreview() {
  return (
    <figure className="lp-window" aria-label="Example of the live caption view with sample text">
      <div className="lp-window-bar">
        <span className="lp-live"><span className="lp-dot" aria-hidden="true" />Live</span>
        <span className="lp-window-title">Physics · Newton’s laws</span>
        <span className="lp-window-lang">English</span>
      </div>
      <div className="lp-stage" aria-hidden="true">
        <p className="lp-line"><span className="lp-who">Teacher · speech</span>An object in motion stays in motion unless acted upon by an external force.</p>
        <p className="lp-line"><span className="lp-who">Asha · typed</span>Could you give an example?</p>
        <p className="lp-line"><span className="lp-who">Ben · sign</span>F O R C E</p>
      </div>
      <div className="lp-window-foot" aria-hidden="true">
        <span>Translated to Español</span><span>3 people · 1 raised hand</span>
      </div>
      <figcaption className="lp-note">Illustration with sample text, not real classroom data.</figcaption>
    </figure>
  );
}

export default function Landing() {
  const { user, isAdmin } = useAuth();
  const home = isAdmin ? '/admin' : '/classroom';
  const start = user ? home : '/register';

  return (
    <div className="lp">
      <a className="skip-link" href="#content">Skip to main content</a>
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <Logo />
          <nav className="lp-nav-links" aria-label="Page sections">
            <a href="#how">How it works</a><a href="#roles">Teachers and students</a><a href="#accessibility">Accessibility</a>
          </nav>
          <div className="lp-nav-actions">
            <ThemeToggle />
            {user ? <Link to={home} className="btn btn-primary btn-sm">Open app</Link> : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm">Log in</Link>
                <Link to="/register" className="btn btn-primary btn-sm">Get started</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="content">
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-copy">
              <p className="lp-kicker">Live captions for the classroom</p>
              <h1>Every word, captioned live for every learner.</h1>
              <p className="lp-lead">EchoSign turns speech and supported sign-language gestures into real-time text, so deaf and hard-of-hearing students can follow every lecture, and everyone can read it their own way.</p>
              <div className="lp-cta">
                <Link to={start} className="btn btn-primary btn-lg">Get started <ArrowRight size={18} aria-hidden="true" /></Link>
                <a href="#how" className="btn btn-outline btn-lg">See how it works</a>
              </div>
            </div>
            <ClassPreview />
          </div>
        </section>

        <section className="lp-facts" aria-label="What makes it different">
          <ul className="lp-wrap lp-facts-grid">
            {facts.map(([t, b]) => <li key={t}><h2>{t}</h2><p>{b}</p></li>)}
          </ul>
        </section>

        <section className="lp-section" id="how" aria-labelledby="how-h">
          <div className="lp-wrap">
            <p className="lp-kicker">How it works</p>
            <h2 id="how-h" className="lp-h2">From hello to transcript in three steps</h2>
            <ol className="lp-steps">
              {steps.map(([t, b], i) => (
                <li key={t}><span className="lp-step-n" aria-hidden="true">{i + 1}</span><h3>{t}</h3><p>{b}</p></li>
              ))}
            </ol>
            <p className="lp-caveat"><b>About sign recognition:</b> it reads ASL fingerspelling (A–Z) and a small set of phrase gestures. It is not a full sign-language translator, and accuracy depends on lighting and camera quality.</p>
          </div>
        </section>

        <section className="lp-section lp-tint" id="roles" aria-labelledby="roles-h">
          <div className="lp-wrap">
            <p className="lp-kicker">Who it is for</p>
            <h2 id="roles-h" className="lp-h2">One class, two points of view</h2>
            <div className="lp-roles">
              <div>
                <h3>Teachers</h3>
                <ul>{teachers.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
              <div>
                <h3>Students</h3>
                <ul>{students.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section" id="accessibility" aria-labelledby="a11y-h">
          <div className="lp-wrap lp-a11y">
            <div>
              <p className="lp-kicker">Built to be accessible</p>
              <h2 id="a11y-h" className="lp-h2">Captions that adapt to the reader</h2>
              <p className="lp-body">Accessibility is the product, not an extra. Every control works with a keyboard and a screen reader, status never relies on colour alone, and each person chooses how captions look.</p>
            </div>
            <ul className="lp-chips" aria-label="Reading options">{comforts.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        </section>

        <section className="lp-cta-band" aria-labelledby="cta-h">
          <div className="lp-wrap lp-cta-inner">
            <div>
              <h2 id="cta-h">Ready for your first captioned class?</h2>
              <p>Create a free account and start a class in under a minute.</p>
            </div>
            <Link to={start} className="btn btn-lg lp-cta-btn">Get started</Link>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner"><Logo /><span>© {new Date().getFullYear()} EchoSign</span></div>
      </footer>
    </div>
  );
}
