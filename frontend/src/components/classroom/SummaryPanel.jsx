import { useState } from 'react';
import { AlertTriangle, Printer, Sparkles } from 'lucide-react';
import * as api from '../../api';
import { printHtml } from '../../lib/captions';
import { useToast } from '../../context/ToastContext';
import { StatusBadge } from '../ui';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function Quiz({ quiz }) {
  const [picked, setPicked] = useState({}); // question index -> chosen option
  const answered = Object.keys(picked).length;
  const correct = quiz.filter((q, i) => picked[i] === q.answerIndex).length;

  return (
    <div className="stack">
      {quiz.map((q, i) => (
        <div key={i} className="quiz-q">
          <b>{i + 1}. {q.question}</b>
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            {q.options.map((o, j) => {
              const chosen = picked[i] === j; const done = picked[i] !== undefined;
              const cls = done ? (j === q.answerIndex ? 'right' : chosen ? 'wrong' : '') : '';
              return <button key={j} className={`quiz-opt ${cls}`} disabled={done} onClick={() => setPicked((p) => ({ ...p, [i]: j }))}>{o}</button>;
            })}
          </div>
        </div>
      ))}
      {quiz.map((q, i) => (picked[i] !== undefined && q.explanation ? <p key={`e${i}`} className="muted" style={{ fontSize: 13 }}><b>{i + 1}.</b> {q.explanation}</p> : null))}
      {answered === quiz.length && <div className="chip chip-go" style={{ alignSelf: 'flex-start' }}>You scored {correct} / {quiz.length}</div>}
    </div>
  );
}

// AI lecture notes, key terms and a short quiz built from the transcript.
export default function SummaryPanel({ room, setRoom, canModerate, captionCount }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const s = room.summary;

  const generate = async () => {
    setBusy(true);
    try {
      const res = await api.classrooms.summary(room.code);
      setRoom((r) => ({ ...r, summary: res.data.summary, summaryAt: res.data.summary.generatedAt }));
      toast('Summary ready', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  const print = () => printHtml(`${room.title} — summary`,
    `<h1>${esc(room.title)} — study notes</h1><div class="meta">Class code ${esc(room.code)}</div>` +
    `<h2>Notes</h2><ul>${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` +
    (s.keyTerms.length ? `<h2>Key terms</h2><ul>${s.keyTerms.map((t) => `<li><b>${esc(t.term)}</b>${t.definition ? ` — ${esc(t.definition)}` : ''}</li>`).join('')}</ul>` : '') +
    (s.quiz.length ? `<h2>Quiz</h2><ol>${s.quiz.map((q) => `<li>${esc(q.question)}<ul>${q.options.map((o, j) => `<li>${'ABCD'[j]}. ${esc(o)}</li>`).join('')}</ul></li>`).join('')}</ol><h2>Answers</h2><p>${s.quiz.map((q, i) => `${i + 1}${'ABCD'[q.answerIndex]}`).join(' · ')}</p>` : ''));

  return (
    <div className="stack">
      <div className="card">
        <div className="row between wrap">
          <div>
            <h2 className="card-title" style={{ marginBottom: 2 }}><Sparkles size={16} style={{ display: 'inline', verticalAlign: -2 }} /> Lecture summary</h2>
            <p className="muted" style={{ fontSize: 14 }}>
              {s ? `Generated ${new Date(s.generatedAt).toLocaleString()}${s.generatedBy ? ` by ${s.generatedBy}` : ''}`
                : 'Notes, key terms and a short quiz made from the class transcript.'}
            </p>
            {s && (s.provider === 'basic'
              ? <p style={{ marginTop: 6 }}><StatusBadge status="warn">Basic summary, not AI</StatusBadge> <span className="muted" style={{ fontSize: 13 }}>{s.fallbackReason || 'The AI service was unavailable.'} Try again later for full notes and a quiz.</span></p>
              : s.coverage === 'partial'
                ? <p style={{ marginTop: 6 }}><StatusBadge status="warn">Partly AI-generated</StatusBadge> <span className="muted" style={{ fontSize: 13 }}>{s.captionCount} captions, read in {s.chunks} parts. {s.partialReason} Check important facts against the lecture.</span></p>
                : <p style={{ marginTop: 6 }}><StatusBadge status="info">AI-generated from the transcript</StatusBadge> <span className="muted" style={{ fontSize: 13 }}>{s.captionCount} captions{s.chunks > 1 ? `, read in ${s.chunks} parts` : ''}. Check important facts against the lecture.</span></p>)}
            {s && s.captionCount !== undefined && captionCount > s.captionCount && <p className="notice" style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}><AlertTriangle size={16} aria-hidden="true" /> The class has {captionCount - s.captionCount} new captions since these notes were made.</p>}
          </div>
          <div className="row" style={{ gap: 8 }}>
            {s && <button className="btn btn-outline btn-sm" onClick={print}><Printer size={15} /> PDF / Print</button>}
            {canModerate && <button className="btn btn-primary btn-sm" disabled={busy || captionCount < 3} onClick={generate}>{busy ? 'Writing…' : s ? 'Regenerate' : 'Generate summary'}</button>}
          </div>
        </div>
        {captionCount < 3 && canModerate && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Needs at least 3 captions first.</p>}
        {!s && !canModerate && <div className="empty">Your teacher hasn’t generated a summary yet.</div>}
      </div>

      {s && (
        <>
          <div className="card"><h2 className="card-title">Notes</h2>
            <ul className="notes">{s.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
          {s.takeaways?.length > 0 && <div className="card"><h2 className="card-title">Main takeaways</h2><ul className="notes">{s.takeaways.map((n, i) => <li key={i}>{n}</li>)}</ul></div>}
          {s.keyTerms.length > 0 && (
            <div className="card"><h2 className="card-title">Key terms</h2>
              <dl className="terms">{s.keyTerms.map((t, i) => <div key={i}><dt>{t.term}</dt><dd>{t.definition || '—'}</dd></div>)}</dl></div>
          )}
          {s.revision?.length > 0 && <div className="card"><h2 className="card-title">Revision points</h2><ul className="notes">{s.revision.map((n, i) => <li key={i}>{n}</li>)}</ul></div>}
          {s.quiz.length > 0 && <div className="card"><h2 className="card-title">Check your understanding</h2><Quiz quiz={s.quiz} /></div>}
        </>
      )}
    </div>
  );
}
