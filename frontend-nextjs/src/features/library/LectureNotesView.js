// The notes, key terms and quiz of a lecture. Used by the full page AND by the modal (intercepting route),
// so the two always show the same thing. Markup and classes match the notes view in the EchoSign React app.
import { EmptyState } from '@/components/ui';

export default function LectureNotesView({ lecture, dict, code }) {
  const { classroom, summary } = lecture;
  return (
    <article>
      <h1>{classroom?.title || code}</h1>
      <p className="muted" style={{ margin: '6px 0 20px' }}>{classroom?.teacher ? `${dict.library.teacher}: ${classroom.teacher} · ` : ''}{code}</p>

      {!summary ? (
        <EmptyState title={dict.lecture.notes}>{dict.lecture.none}</EmptyState>
      ) : (
        <div className="stack-lg">
          {summary.notes?.length > 0 && (
            <section className="card">
              <h2 className="card-title">{dict.lecture.notes}</h2>
              <ul className="notes">{summary.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </section>
          )}
          {summary.keyTerms?.length > 0 && (
            <section className="card">
              <h2 className="card-title">{dict.lecture.keyTerms}</h2>
              <dl className="terms">{summary.keyTerms.map((t, i) => <div key={i}><dt>{t.term}</dt><dd>{t.definition || '—'}</dd></div>)}</dl>
            </section>
          )}
          {summary.quiz?.length > 0 && (
            <section className="card">
              <h2 className="card-title">{dict.lecture.quiz}</h2>
              <ol className="stack-lg" style={{ paddingLeft: 20 }}>
                {summary.quiz.map((q, i) => (
                  <li key={i}>
                    <b>{q.question}</b>
                    <ul className="muted" style={{ listStyle: 'none', padding: 0, margin: '6px 0 0' }}>{q.options?.map((o, j) => <li key={j}>{'ABCD'[j]}. {o}</li>)}</ul>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </article>
  );
}
