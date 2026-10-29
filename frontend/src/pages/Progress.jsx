// Progress - skill bars and performance charts
import { Bar, Line } from 'react-chartjs-2';
import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip,
} from 'chart.js';
import { BarChart3, Flame, Mic, Target, Timer } from 'lucide-react';
import * as api from '../api';
import { useAuth } from '../context/AuthContext';
import { langName } from '../lib';
import { useUiPrefs } from '../hooks/useUiPrefs';
import { EmptyState, ErrorState, LoadingState, PageHeader, Skeleton } from '../components/ui';

ChartJS.register(BarElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip);

// Chart colours follow the theme (set at the top of each render, before the options are built).
let INK = '#15153a';
let GRID = '#e4e0fa';
let SUB = '#585879';
const axisTitle = (text) => ({ display: true, text, color: SUB, font: { weight: '600' } });
const baseOptions = (xTitle, yTitle) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { padding: 10 } },
  scales: {
    y: { beginAtZero: true, max: 100, grid: { color: GRID }, ticks: { color: INK }, title: axisTitle(yTitle) },
    x: { grid: { display: false }, ticks: { color: INK }, title: axisTitle(xTitle) },
  },
});

// ISO week start (Monday) as YYYY-MM-DD, for "sessions per week"
const weekStart = (d) => {
  const x = new Date(d); const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
};

function ChartCard({ title, subtitle, summary, table, children, wide }) {
  return (
    <section className={`card ${wide ? 'wide' : ''}`} aria-label={title}>
      <h2 className="card-title" style={{ marginBottom: 2 }}>{title}</h2>
      {subtitle && <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{subtitle}</p>}
      <div className="chart-box" role="img" aria-label={summary}>{children}</div>
      <details className="data-table">
        <summary>View the data as a table</summary>
        <div className="table-wrap" style={{ marginTop: 8 }}>{table}</div>
      </details>
    </section>
  );
}

export default function Progress() {
  const { user, activity } = useAuth();
  const { resolvedTheme } = useUiPrefs();
  const dark = resolvedTheme === 'dark';
  INK = dark ? '#f3f0ff' : '#15153a'; GRID = dark ? '#2f2960' : '#e4e0fa'; SUB = dark ? '#b4afd6' : '#585879';
  const [trend, setTrend] = useState(null);
  const [days, setDays] = useState(30);
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');
  const [skills, setSkills] = useState(null);

  useEffect(() => { setTrend(null); api.speech.trend(days).then((r) => setTrend(r.data.trend || [])).catch((e) => { setError(e.message); setTrend([]); }); }, [days]);
  useEffect(() => { setSkills(null); api.speech.skills(days).then((r) => setSkills(r.data)).catch(() => setSkills({ attempts: 0 })); }, [days]);
  useEffect(() => { api.sessions.list({ limit: 50 }).then((r) => setSessions(r.data.sessions || [])).catch((e) => { setError(e.message); setSessions([]); }); }, []);

  const perLanguage = useMemo(() => {
    const map = {};
    (sessions || []).forEach((s) => { map[s.language] ||= { total: 0, n: 0 }; map[s.language].total += s.accuracy; map[s.language].n += 1; });
    return Object.entries(map).map(([code, v]) => ({ code, avg: Math.round(v.total / v.n), n: v.n }));
  }, [sessions]);

  const perWeek = useMemo(() => {
    const map = {};
    (sessions || []).forEach((s) => { const k = weekStart(s.createdAt); map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-8).map(([week, count]) => ({ week, count }));
  }, [sessions]);

  const profile = user?.profile;
  const stats = [
    { icon: Mic, label: 'Sessions', value: profile?.totalSessions ?? 0, bg: 'var(--violet-light)', color: 'var(--violet-dark)' },
    { icon: Target, label: 'Average accuracy', value: `${Math.round(profile?.avgAccuracy ?? 0)}%`, bg: 'var(--mint)', color: 'var(--go)' },
    { icon: Timer, label: 'Practice time', value: `${profile?.totalMinutes ?? 0} min`, bg: 'var(--peach)', color: '#9a3412' },
    { icon: Flame, label: 'Current streak', value: `${activity?.streak?.current ?? profile?.streak ?? 0} days`, bg: '#fef3c7', color: '#8a4a05' },
  ];

  const loading = trend === null || sessions === null;
  const noData = !loading && !(sessions || []).length && !(trend || []).length;

  return (
    <>
      <PageHeader icon={BarChart3} title="Your progress" subtitle="Track your practice and how your accuracy changes over time."
        actions={(
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="range" className="sr-only">Time range</label>
            <select id="range" className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
            </select>
          </div>
        )} />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        {stats.map(({ icon: Icon, label, value, bg, color }) => (
          <div className="card stat" key={label}>
            <div className="stat-icon" style={{ background: bg, color }} aria-hidden="true"><Icon size={20} /></div>
            <div className="num">{value}</div><div className="label">{label}</div>
          </div>
        ))}
      </div>

      {error && !loading && <ErrorState message={error} />}
      {loading && (
        <div className="grid grid-2" aria-busy="true"><div className="card"><Skeleton height={20} width="40%" /><Skeleton height={240} style={{ marginTop: 16 }} /></div><div className="card"><Skeleton height={20} width="40%" /><Skeleton height={240} style={{ marginTop: 16 }} /></div></div>
      )}
      {noData && !error && <div className="card"><EmptyState icon={BarChart3} title="No practice data yet">Complete a practice session and your charts will appear here.</EmptyState></div>}

      {!loading && skills && (
        <section className="card" aria-labelledby="skills-h" style={{ marginBottom: 'var(--gap)' }}>
          <h2 id="skills-h" className="card-title" style={{ marginBottom: 2 }}>Skill breakdown</h2>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Average scores from pronunciation practice, last {days} days{skills.attempts ? ` · ${skills.attempts} attempts` : ''}</p>
          {skills.attempts ? (
            <ul className="skill-list">
              {[['Accuracy', skills.accuracy], ['Fluency', skills.fluency], ['Intonation', skills.intonation], ['Stress', skills.stress]].map(([label, v]) => (
                <li key={label}>
                  <span>{label}</span>
                  <div className="skill-bar" role="img" aria-label={`${label}: ${v ?? 'no data'}${v == null ? '' : ' percent'}`}><i style={{ width: `${v ?? 0}%` }} /></div>
                  <b>{v == null ? '—' : `${v}%`}</b>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={Mic} title="No pronunciation practice in this period">Try a Practice session to see your skills here.</EmptyState>}
        </section>
      )}

      {!loading && !noData && (
        <div className="grid grid-2">
          <ChartCard title="Accuracy over time" subtitle={`Daily average accuracy, last ${days} days`}
            summary={trend.length ? `Line chart of daily average accuracy over the last ${days} days, from ${Math.round(trend[0].avgAccuracy)} to ${Math.round(trend[trend.length - 1].avgAccuracy)} percent.` : 'No accuracy data in this period.'}
            table={<table className="table"><thead><tr><th scope="col">Date</th><th scope="col">Average accuracy</th><th scope="col">Attempts</th></tr></thead><tbody>{trend.map((t) => <tr key={t._id}><td>{t._id}</td><td>{Math.round(t.avgAccuracy)}%</td><td>{t.count}</td></tr>)}</tbody></table>}>
            {trend.length ? (
              <Line options={baseOptions('Date', 'Accuracy (%)')}
                data={{ labels: trend.map((t) => t._id), datasets: [{ label: 'Average accuracy (%)', data: trend.map((t) => Math.round(t.avgAccuracy)), borderColor: '#5b3df5', backgroundColor: 'rgba(91,61,245,0.12)', fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: '#5b3df5' }] }} />
            ) : <EmptyState icon={BarChart3} title="No data for this period">Try a longer time range.</EmptyState>}
          </ChartCard>

          <ChartCard title="Accuracy by language" subtitle={`Average across your last ${sessions.length} sessions`}
            summary={perLanguage.length ? `Bar chart of average accuracy for ${perLanguage.map((l) => `${langName(l.code)} ${l.avg} percent`).join(', ')}.` : 'No sessions yet.'}
            table={<table className="table"><thead><tr><th scope="col">Language</th><th scope="col">Average accuracy</th><th scope="col">Sessions</th></tr></thead><tbody>{perLanguage.map((l) => <tr key={l.code}><td>{langName(l.code)}</td><td>{l.avg}%</td><td>{l.n}</td></tr>)}</tbody></table>}>
            {perLanguage.length ? (
              <Bar options={baseOptions('Language', 'Accuracy (%)')}
                data={{ labels: perLanguage.map((l) => langName(l.code)), datasets: [{ label: 'Average accuracy (%)', data: perLanguage.map((l) => l.avg), backgroundColor: '#7c5cff', borderRadius: 8 }] }} />
            ) : <EmptyState icon={BarChart3} title="No sessions yet" />}
          </ChartCard>

          <ChartCard wide title="Sessions per week" subtitle="Weeks starting Monday, from your last 50 sessions"
            summary={perWeek.length ? `Bar chart of sessions per week: ${perWeek.map((w) => `week of ${w.week} ${w.count}`).join(', ')}.` : 'No sessions yet.'}
            table={<table className="table"><thead><tr><th scope="col">Week starting</th><th scope="col">Sessions</th></tr></thead><tbody>{perWeek.map((w) => <tr key={w.week}><td>{w.week}</td><td>{w.count}</td></tr>)}</tbody></table>}>
            {perWeek.length ? (
              <Bar options={{ ...baseOptions('Week starting', 'Sessions'), scales: { ...baseOptions().scales, y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: INK, precision: 0 }, title: axisTitle('Sessions') }, x: { grid: { display: false }, ticks: { color: INK }, title: axisTitle('Week starting') } } }}
                data={{ labels: perWeek.map((w) => w.week.slice(5)), datasets: [{ label: 'Sessions', data: perWeek.map((w) => w.count), backgroundColor: '#5b3df5', borderRadius: 8 }] }} />
            ) : <EmptyState icon={BarChart3} title="No sessions yet" />}
          </ChartCard>
        </div>
      )}
      {loading && <LoadingState label="Loading your progress…" />}
    </>
  );
}

