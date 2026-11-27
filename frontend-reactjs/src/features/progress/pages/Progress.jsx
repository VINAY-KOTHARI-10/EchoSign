// Progress - skill bars and performance charts
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { groupBy, sum } from '../../../lib/jsUtils';
import { Bar, Line } from 'react-chartjs-2';
import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip,
} from 'chart.js';
import { BarChart3, Flame, Mic, Target, Timer } from 'lucide-react';
import * as api from '../../../api';
import { useAuth } from '../../../context/AuthContext';
import { langName } from '../../../lib';
import { useUiPrefs } from '../../../hooks/useUiPrefs';
import { EmptyState, ErrorState, LoadingState, PageHeader, Skeleton } from '../../../components/ui';

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
    x: { grid: { display: false }, ticks: { color: INK, maxTicksLimit: 8, maxRotation: 0 }, title: axisTitle(xTitle) },
  },
});

// ISO week start (Monday) as YYYY-MM-DD, for "sessions per week"
const weekStart = (d) => {
  const x = new Date(d); const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0);
  // the local date (toISOString would give the day before in time zones ahead of UTC)
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

// 2026-11-09 -> "Nov 9" for chart labels (the data tables keep the full date)
const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });

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
  const [days, setDays] = useState(30);
  // Server state through React Query: each (kind, days) answer is cached, so switching back to a range is instant.
  const trendQ = useQuery({ queryKey: ['progress', 'trend', days], queryFn: () => api.speech.trend(days).then((r) => r.data.trend || []) });
  const skillsQ = useQuery({ queryKey: ['progress', 'skills', days], queryFn: () => api.speech.skills(days).then((r) => r.data).catch(() => ({ attempts: 0 })) });
  const sessionsQ = useQuery({ queryKey: ['progress', 'sessions'], queryFn: () => api.sessions.list({ limit: 50 }).then((r) => r.data.sessions || []) });
  const trend = trendQ.isPending ? null : (trendQ.data ?? []);
  const skills = skillsQ.isPending ? null : (skillsQ.data ?? { attempts: 0 });
  const sessions = sessionsQ.isPending ? null : (sessionsQ.data ?? []);
  const error = (trendQ.error || sessionsQ.error)?.message || '';

  const perLanguage = useMemo(() => {
    // groupBy / sum come from lib/jsUtils.js (same result as before, written with array methods)
    return Object.entries(groupBy(sessions || [], (s) => s.language))
      .map(([code, list]) => ({ code, avg: Math.round(sum(...list.map((s) => s.accuracy)) / list.length), n: list.length }));
  }, [sessions]);

  const perWeek = useMemo(() => {
    return Object.entries(groupBy(sessions || [], (s) => weekStart(s.createdAt)))
      .map(([week, list]) => [week, list.length])
      .sort(([a], [b]) => a.localeCompare(b)).slice(-8).map(([week, count]) => ({ week, count }));
  }, [sessions]);

  const profile = user?.profile;
  const stats = [
    { icon: Mic, label: 'Sessions', hint: 'practice sessions saved', value: profile?.totalSessions ?? 0, bg: 'var(--violet-light)', color: 'var(--violet-dark)' },
    { icon: Target, label: 'Average accuracy', hint: 'across all sessions', value: `${Math.round(profile?.avgAccuracy ?? 0)}%`, bg: 'var(--mint)', color: 'var(--go)' },
    { icon: Timer, label: 'Practice time', hint: 'time spent practising', value: `${profile?.totalMinutes ?? 0} min`, bg: 'var(--peach)', color: '#9a3412' },
    { icon: Flame, label: 'Current streak', hint: 'days in a row', value: `${activity?.streak?.current ?? profile?.streak ?? 0} days`, bg: '#fef3c7', color: '#8a4a05' },
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

      <div className="grid grid-4" style={{ marginBottom: 'var(--gap)' }}>
        {stats.map(({ label, value, hint }) => (
          <div className="card stat" key={label}>
            <div className="num">{value}</div><div className="label">{label}</div><div className="muted" style={{ fontSize: 12 }}>{hint}</div>
          </div>
        ))}
      </div>

      {error && !loading && <ErrorState message={error} />}
      {loading && (
        <div className="grid grid-2" aria-busy="true"><div className="card"><Skeleton height={20} width="40%" /><Skeleton height={240} style={{ marginTop: 16 }} /></div><div className="card"><Skeleton height={20} width="40%" /><Skeleton height={240} style={{ marginTop: 16 }} /></div></div>
      )}
      {noData && !error && <div className="card"><EmptyState icon={BarChart3} title="No practice data yet" action={<Link to="/dashboard" className="btn btn-primary btn-sm" style={{ marginTop: 14 }}>Start practising</Link>}>Complete a practice session and your charts will appear here.</EmptyState></div>}

      {!loading && !noData && skills && (
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
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <ChartCard title="Accuracy over time" subtitle={`Daily average accuracy, last ${days} days`}
            summary={trend.length ? `Line chart of daily average accuracy over the last ${days} days, from ${Math.round(trend[0].avgAccuracy)} to ${Math.round(trend[trend.length - 1].avgAccuracy)} percent.` : 'No accuracy data in this period.'}
            table={<table className="table"><thead><tr><th scope="col">Date</th><th scope="col">Average accuracy</th><th scope="col">Attempts</th></tr></thead><tbody>{trend.map((t) => <tr key={t._id}><td>{t._id}</td><td>{Math.round(t.avgAccuracy)}%</td><td>{t.count}</td></tr>)}</tbody></table>}>
            {trend.length ? (
              <Line options={baseOptions('Date', 'Accuracy (%)')}
                data={{ labels: trend.map((t) => shortDate(t._id)), datasets: [{ label: 'Average accuracy (%)', data: trend.map((t) => Math.round(t.avgAccuracy)), borderColor: '#5b3df5', backgroundColor: 'rgba(91,61,245,0.12)', fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: '#5b3df5' }] }} />
            ) : <EmptyState icon={BarChart3} title="No data for this period">Try a longer time range.</EmptyState>}
          </ChartCard>

          <ChartCard title="Accuracy by language" subtitle={`Average across your last ${sessions.length} sessions`}
            summary={perLanguage.length ? `Bar chart of average accuracy for ${perLanguage.map((l) => `${langName(l.code)} ${l.avg} percent`).join(', ')}.` : 'No sessions yet.'}
            table={<table className="table"><thead><tr><th scope="col">Language</th><th scope="col">Average accuracy</th><th scope="col">Sessions</th></tr></thead><tbody>{perLanguage.map((l) => <tr key={l.code}><td>{langName(l.code)}</td><td>{l.avg}%</td><td>{l.n}</td></tr>)}</tbody></table>}>
            {perLanguage.length ? (
              <Bar options={baseOptions('Language', 'Accuracy (%)')}
                data={{ labels: perLanguage.map((l) => langName(l.code)), datasets: [{ label: 'Average accuracy (%)', data: perLanguage.map((l) => l.avg), backgroundColor: '#7c5cff', borderRadius: 8, maxBarThickness: 72 }] }} />
            ) : <EmptyState icon={BarChart3} title="No sessions yet" />}
          </ChartCard>

          <ChartCard wide title="Sessions per week" subtitle="Weeks starting Monday, from your last 50 sessions"
            summary={perWeek.length ? `Bar chart of sessions per week: ${perWeek.map((w) => `week of ${w.week} ${w.count}`).join(', ')}.` : 'No sessions yet.'}
            table={<table className="table"><thead><tr><th scope="col">Week starting</th><th scope="col">Sessions</th></tr></thead><tbody>{perWeek.map((w) => <tr key={w.week}><td>{w.week}</td><td>{w.count}</td></tr>)}</tbody></table>}>
            {perWeek.length ? (
              <Bar options={{ ...baseOptions('Week starting', 'Sessions'), scales: { ...baseOptions().scales, y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: INK, precision: 0 }, title: axisTitle('Sessions') }, x: { grid: { display: false }, ticks: { color: INK }, title: axisTitle('Week starting') } } }}
                data={{ labels: perWeek.map((w) => shortDate(w.week)), datasets: [{ label: 'Sessions', data: perWeek.map((w) => w.count), backgroundColor: '#5b3df5', borderRadius: 8, maxBarThickness: 72 }] }} />
            ) : <EmptyState icon={BarChart3} title="No sessions yet" />}
          </ChartCard>
        </div>
      )}
      {loading && <LoadingState label="Loading your progress…" />}
    </>
  );
}

