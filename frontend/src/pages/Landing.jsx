import { Link } from 'react-router-dom';
import { ArrowRight, Captions, CheckCircle2, Globe, Hand, Keyboard, Languages, Mic, MonitorSmartphone, Sparkles, Users } from 'lucide-react';
import Logo from '../components/Logo';
import ThemeToggle from '../components/ThemeToggle';
import Waveform from '../components/Waveform';
import { useAuth } from '../context/AuthContext';

const highlights = [
  { icon: Captions, label: 'Real-time captions' },
  { icon: Hand, label: 'Sign recognition' },
  { icon: Globe, label: 'Multi-language' },
  { icon: Users, label: 'Inclusive learning' },
];

const features = [
  { icon: Mic, title: 'Speech to text', body: 'The teacher speaks and captions appear on every student’s screen within moments, in 12 languages.', size: 'wide', art: 'wave' },
  { icon: Hand, title: 'Sign to text', body: 'Fingerspell with ASL letters or use supported gestures. Recognition runs in your browser, so video never leaves the device.', size: 'tall', art: 'sign' },
  { icon: Globe, title: 'Caption translation', body: 'Students can read captions translated into their own language, shown under the original.' },
  { icon: Keyboard, title: 'Type or tap', body: 'Anyone can type a caption or tap a quick phrase, and raise a hand to ask a question.' },
  { icon: Sparkles, title: 'Notes after class', body: 'Generate lecture notes, key terms and a short quiz from the transcript, and export subtitles or a PDF.', size: 'wide' },
  { icon: MonitorSmartphone, title: 'Comfortable to read', body: 'Adjust caption size, font, spacing, colours and reading pace, with light, dark and high-contrast modes.' },
];

const steps = [
  ['Start or join', 'A teacher starts a class and shares a 6-character code. Students join from any device.'],
  ['Caption everything', 'Speech, signs and typed messages become live captions, saved to a searchable transcript.'],
  ['Review together', 'Download the transcript, subtitles and AI-generated notes after class.'],
];

const a11y = [
  'Full keyboard navigation with visible focus',
  'Adjustable caption size, font, spacing and colours',
  'High-contrast and reduced-motion modes',
  'Status never relies on colour alone',
  'Works on phones, tablets and desktops',
];

function CaptionDemo() {
  return (
    <div className="hero-art">
      <figure className="demo glass" aria-label="Example of the live caption view">
        <div className="demo-bar"><span className="badge badge-live"><span className="pulse-dot" aria-hidden="true" /> LIVE</span><span className="muted">Physics · Newton’s laws</span></div>
        <div className="demo-captions" aria-hidden="true">
          <p className="demo-who">Teacher</p>
          <p>An object in motion stays in motion unless acted upon by an external force.</p>
          <p className="demo-who">Student · typed</p>
          <p>Could you give an example?</p>
        </div>
        <div className="demo-status" aria-hidden="true">
          <span className="badge badge-ok"><Mic size={12} /> Microphone on</span>
          <span className="badge badge-info"><Hand size={12} /> Sign: letter “F”</span>
        </div>
        <figcaption className="demo-note">Illustration with sample text, not real classroom data.</figcaption>
      </figure>
      <div className="float-card fc-speech glass" aria-hidden="true">
        <span className="fc-icon"><Mic size={16} /></span>
        <div><b>Speech detected</b><span>English · live</span></div>
        <Waveform bars={7} />
      </div>
      <div className="float-card fc-sign glass" aria-hidden="true">
        <span className="fc-icon mint"><Hand size={16} /></span>
        <div><b>Sign recognised</b><span>Letter “F”</span></div>
        <span className="fc-letter">F</span>
      </div>
      <div className="float-card fc-lang glass" aria-hidden="true">
        <span className="fc-icon peach"><Languages size={16} /></span>
        <div><b>Translated</b><span>Español</span></div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { user, isAdmin } = useAuth();
  const home = isAdmin ? '/admin' : '/classroom';

  return (
    <>
      <a className="skip-link" href="#content">Skip to main content</a>
      <header className="navbar">
        <div className="container navbar-inner">
          <Logo />
          <nav className="nav-links" aria-label="Page sections">
            <a href="#features">Features</a><a href="#how">How it works</a><a href="#accessibility">Accessibility</a>
          </nav>
          <div className="row">
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
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <span className="badge badge-info"><CheckCircle2 size={13} aria-hidden="true" /> Accessible classrooms for everyone</span>
              <h1>Every word, <span className="grad-text">captioned live</span> for every learner.</h1>
              <p className="lead">A classroom accessibility platform that converts speech and supported sign-language gestures into real-time text captions, helping deaf and hard-of-hearing students follow every lecture.</p>
              <div className="hero-actions">
                <Link to={user ? home : '/register'} className="btn btn-primary btn-lg btn-glow">Get started <ArrowRight size={18} aria-hidden="true" /></Link>
                <a href="#how" className="btn btn-outline btn-lg">See how it works</a>
              </div>
              <ul className="hero-points" aria-label="Highlights">
                {highlights.map(({ icon: Icon, label }) => <li key={label}><Icon size={18} aria-hidden="true" />{label}</li>)}
              </ul>
            </div>
            <CaptionDemo />
          </div>
        </section>

        <section className="section" id="features" aria-labelledby="features-h">
          <div className="container">
            <div className="eyebrow">Features</div>
            <h2 id="features-h">Everything a captioned classroom needs</h2>
            <div className="bento">
              {features.map(({ icon: Icon, title, body, size, art }) => (
                <article key={title} className={`card feature bento-${size || 'sm'}`}>
                  <div className="icon-wrap" aria-hidden="true"><Icon size={22} /></div>
                  <h3>{title}</h3>
                  <p className="muted">{body}</p>
                  {art === 'wave' && <Waveform bars={24} className="big" />}
                  {art === 'sign' && <div className="sign-art" aria-hidden="true">{['A', 'B', 'C', 'F'].map((c) => <span key={c}>{c}</span>)}</div>}
                </article>
              ))}
            </div>
            <p className="note"><b>About sign recognition:</b> it reads ASL fingerspelling (A–Z) and a small set of phrase gestures. It is not a full sign-language translator, and accuracy depends on lighting and camera quality.</p>
          </div>
        </section>

        <section className="section soft" id="how" aria-labelledby="how-h">
          <div className="container">
            <div className="eyebrow">How it works</div>
            <h2 id="how-h">Three steps from hello to transcript</h2>
            <ol className="steps">
              {steps.map(([t, b], i) => (
                <li key={t} className="card"><span className="step-n" aria-hidden="true">{i + 1}</span><h3>{t}</h3><p className="muted">{b}</p></li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section" id="accessibility" aria-labelledby="a11y-h">
          <div className="container a11y-grid">
            <div>
              <div className="eyebrow">Built to be accessible</div>
              <h2 id="a11y-h">Designed with the people who use it</h2>
              <p className="muted" style={{ marginTop: 10 }}>Accessibility is the product, not an extra. Every control works with a keyboard and a screen reader, and captions adapt to the reader.</p>
              <ul className="checks">{a11y.map((t) => <li key={t}><CheckCircle2 size={18} aria-hidden="true" /> {t}</li>)}</ul>
            </div>
            <div className="cta-band">
              <h2>Ready for your first captioned class?</h2>
              <p>Create a free account and start a class in under a minute.</p>
              <Link to={user ? home : '/register'} className="btn btn-lg">Get started</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container row between wrap"><Logo /><span>© {new Date().getFullYear()} EchoSign</span></div>
      </footer>
    </>
  );
}
