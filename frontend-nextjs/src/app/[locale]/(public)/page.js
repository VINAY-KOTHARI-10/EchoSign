// The home page. Fully static (SSG): built once per language at build time, then served from the CDN.
// The layout and class names are the same as the EchoSign React landing page, so the two sites look alike.
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BookOpen, CheckCircle2, Hand, Languages, Mic, NotebookPen } from 'lucide-react';
import Waveform from '@/components/Waveform';
import { getDictionary } from '@/i18n/get-dictionary';

// This line runs when the site is BUILT, not on every visit: that is what "static" means.
const BUILT_AT = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const POINT_ICONS = [Hand, BookOpen, NotebookPen, Languages];

function CaptionDemo({ note }) {
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
        <figcaption className="demo-note">{note}</figcaption>
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

export default async function HomePage({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  const features = [
    { icon: Hand, title: d.home.f1t, body: d.home.f1b, href: `/${locale}/signs` },
    { icon: BookOpen, title: d.home.f2t, body: d.home.f2b, href: `/${locale}/library` },
    { icon: NotebookPen, title: d.home.f3t, body: d.home.f3b, href: `/${locale}/notes` },
  ];

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="badge badge-info"><CheckCircle2 size={13} aria-hidden="true" /> {d.home.badge}</span>
            <h1>{d.home.title} <span className="grad-text">{d.home.titleAccent}</span></h1>
            <p className="lead">{d.home.lead}</p>
            <div className="hero-actions">
              <Link href={`/${locale}/dashboard`} className="btn btn-primary btn-lg btn-glow">{d.home.cta} <ArrowRight size={18} aria-hidden="true" /></Link>
              <Link href={`/${locale}/signs`} className="btn btn-outline btn-lg">{d.home.ctaSecondary}</Link>
            </div>
            <ul className="hero-points" aria-label="Highlights">
              {d.home.points.map((label, i) => { const Icon = POINT_ICONS[i]; return <li key={label}><Icon size={18} aria-hidden="true" />{label}</li>; })}
            </ul>
          </div>
          <CaptionDemo note={d.home.sample} />
        </div>
      </section>

      <section className="section" id="features" aria-labelledby="features-h">
        <div className="container">
          <div className="eyebrow">{d.home.eyebrow}</div>
          <h2 id="features-h">{d.home.featuresTitle}</h2>
          <div className="bento">
            {features.map(({ icon: Icon, title, body, href }) => (
              <article key={title} className="card feature">
                <div className="icon-wrap" aria-hidden="true"><Icon size={22} /></div>
                <h3>{title}</h3>
                <p className="muted">{body}</p>
                <Link href={href} className="link">→</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section soft" id="how" aria-labelledby="how-h">
        <div className="container">
          <div className="eyebrow">{d.home.stepsEyebrow}</div>
          <h2 id="how-h">{d.home.stepsTitle}</h2>
          <ol className="steps">
            {d.home.steps.map(([t, b], i) => (
              <li key={t} className="card"><span className="step-n" aria-hidden="true">{i + 1}</span><h3>{t}</h3><p className="muted">{b}</p></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section" aria-labelledby="preview-h">
        <div className="container a11y-grid">
          <div>
            <div className="eyebrow">{d.home.f1t}</div>
            <h2 id="preview-h">{d.home.ctaTitle}</h2>
            <p className="muted" style={{ marginTop: 10 }}>{d.home.ctaBody}</p>
            {/* next/image: resized, converted to AVIF/WebP and lazy-loaded automatically. */}
            <Image src="/hero.png" alt="" width={1200} height={800} sizes="(min-width: 900px) 520px, 100vw" style={{ width: '100%', height: 'auto', borderRadius: 24, marginTop: 20 }} />
          </div>
          <div className="cta-band">
            <h2>{d.home.ctaTitle}</h2>
            <p>{d.home.ctaBody}</p>
            <Link href={`/${locale}/register`} className="btn btn-lg">{d.nav.register}</Link>
          </div>
        </div>
      </section>
      <p className="container muted" style={{ fontSize: 13, paddingBottom: 24 }}>{d.home.built}: {BUILT_AT}</p>
    </>
  );
}
