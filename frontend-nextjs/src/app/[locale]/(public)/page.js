// The home page. Fully static (SSG): built once per language at build time, then served from the CDN.
// This is a copy of the EchoSign React landing page: the same sections, class names and (in English) words.
import Link from 'next/link';
import { ArrowRight, BookOpen, Bot, Captions, CheckCircle2, Globe, Hand, Keyboard, Languages, LibraryBig, Mic, MonitorSmartphone, ShieldCheck, Sparkles, Users, Video } from 'lucide-react';
import Waveform from '@/components/Waveform';
import { getLandingCopy } from '@/features/landing/copy';

const POINT_ICONS = [Captions, Hand, Globe, Users];
const FEATURE_ICONS = [Mic, Hand, Globe, Keyboard, Sparkles, Video, MonitorSmartphone];
const FEATURE_LAYOUT = [{ size: 'wide', art: 'wave' }, { size: 'tall', art: 'sign' }, {}, {}, {}, { size: 'wide' }, {}];
const MODULE_ICONS = [Hand, BookOpen, Bot, LibraryBig, Users, ShieldCheck];

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
  const c = getLandingCopy(locale);
  const register = `/${locale}/register`;

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="badge badge-info"><CheckCircle2 size={13} aria-hidden="true" /> {c.hero.badge}</span>
            <h1>{c.hero.title} <span className="grad-text">{c.hero.accent}</span> {c.hero.title2}</h1>
            <p className="lead">{c.hero.lead}</p>
            <div className="hero-actions">
              <Link href={register} className="btn btn-primary btn-lg btn-glow">{c.hero.cta} <ArrowRight size={18} aria-hidden="true" /></Link>
              <a href="#how" className="btn btn-outline btn-lg">{c.hero.secondary}</a>
            </div>
            <ul className="hero-points" aria-label="Highlights">
              {c.hero.points.map((label, i) => { const Icon = POINT_ICONS[i]; return <li key={label}><Icon size={18} aria-hidden="true" />{label}</li>; })}
            </ul>
          </div>
          <CaptionDemo note={c.demo.note} />
        </div>
      </section>

      <section className="stats-band" aria-label="EchoSign at a glance">
        <div className="container stats-grid">
          {c.stats.map(([n, l]) => <div key={l}><b>{n}</b><span>{l}</span></div>)}
        </div>
      </section>

      <section className="section" id="features" aria-labelledby="features-h">
        <div className="container">
          <div className="eyebrow">{c.features.eyebrow}</div>
          <h2 id="features-h">{c.features.title}</h2>
          <div className="bento">
            {c.features.items.map(([title, body], i) => {
              const Icon = FEATURE_ICONS[i];
              const { size, art } = FEATURE_LAYOUT[i];
              return (
                <article key={title} className={`card feature bento-${size || 'sm'}`}>
                  <div className="icon-wrap" aria-hidden="true"><Icon size={22} /></div>
                  <h3>{title}</h3>
                  <p className="muted">{body}</p>
                  {art === 'wave' && <Waveform bars={24} className="big" />}
                  {art === 'sign' && <div className="sign-art" aria-hidden="true">{['A', 'B', 'C', 'F'].map((ch) => <span key={ch}>{ch}</span>)}</div>}
                </article>
              );
            })}
          </div>
          <p className="note"><b>{c.features.note[0]}</b> {c.features.note[1]}</p>
        </div>
      </section>

      <section className="section soft" id="how" aria-labelledby="how-h">
        <div className="container">
          <div className="eyebrow">{c.how.eyebrow}</div>
          <h2 id="how-h">{c.how.title}</h2>
          <ol className="steps">
            {c.how.steps.map(([t, b], i) => (
              <li key={t} className="card"><span className="step-n" aria-hidden="true">{i + 1}</span><h3>{t}</h3><p className="muted">{b}</p></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section" id="platform" aria-labelledby="platform-h">
        <div className="container">
          <div className="eyebrow">{c.platform.eyebrow}</div>
          <h2 id="platform-h">{c.platform.title}</h2>
          <p className="muted platform-lead">{c.platform.lead}</p>
          <div className="platform-grid">
            {c.platform.modules.map(([title, body], i) => {
              const Icon = MODULE_ICONS[i];
              return (
                <article key={title} className="card module">
                  <div className="icon-wrap" aria-hidden="true"><Icon size={20} /></div>
                  <h3>{title}</h3>
                  <p className="muted">{body}</p>
                </article>
              );
            })}
          </div>
          <div className="cta-band cta-wide">
            <div>
              <h2>{c.platform.cta[0]}</h2>
              <p>{c.platform.cta[1]}</p>
            </div>
            <Link href={register} className="btn btn-lg">{c.hero.cta} <ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
        </div>
      </section>
    </>
  );
}
