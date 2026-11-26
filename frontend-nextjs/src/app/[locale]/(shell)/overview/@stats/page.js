// Slot 1: numbers. The notes count comes from this site's own database (Prisma); the lectures count from the EchoSign backend.
import { getAttended } from '@/features/library/data';
import { countNotes } from '@/features/notes/data';
import { getDictionary } from '@/i18n/get-dictionary';
import { requireSession } from '@/lib/session';

export default async function StatsSlot({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  const { user, token } = await requireSession(locale, `/${locale}/overview`);
  const [notes, lectures] = await Promise.all([countNotes(user.id), getAttended(token, 1)]);

  const tiles = [
    [d.dashboard.notesCount, notes],
    [d.dashboard.lecturesCount, lectures.ok ? lectures.pagination.total : '—'],
  ];
  return (
    <section aria-labelledby="stats-h" className="card">
      <h2 id="stats-h" className="card-title">{d.dashboard.stats}</h2>
      <div className="grid-stats">
        {tiles.map(([label, value]) => (
          <div key={label} className="card stat">
            <span className="num">{value}</span>
            <span className="label">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
