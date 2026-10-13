// A card that shows one time stamp, used by the four rendering examples.
export default function TimeCard({ title, body, label, time, note }) {
  return (
    <div className="container section">
      <article className="card time-card">
        <h1>{title}</h1>
        <p className="muted" style={{ marginTop: 8 }}>{body}</p>
        <div className="eyebrow" style={{ marginTop: 24 }}>{label}</div>
        <p className="time-big" data-testid="time">{time}</p>
        {note && <p className="muted mono" style={{ marginTop: 16, fontSize: 13 }}>{note}</p>}
      </article>
    </div>
  );
}

export const formatTime = (date) => `${new Date(date).toISOString().slice(0, 19).replace('T', ' ')} UTC`;
