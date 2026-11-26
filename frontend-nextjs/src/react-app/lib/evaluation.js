// Recognition evaluation: turns labelled samples collected with a real camera into accuracy, precision, recall, a
// confusion matrix, a rejection rate and per-letter results. It only measures; it never invents numbers, and with no
// samples it reports nothing. Samples come from the Sign Lab "Recognition test" tab (or scripts/eval-signs.mjs).
//
// A sample: { label: 'B', predicted: 'B' | null, confidence, landmarks: [[x,y] x21], meta: { signer, lighting, ... } }
//   predicted = null means the recogniser declined to answer (rejected).

export const LETTERS = 'ABCDEFGHIKLMNOPQRSTUVWXY'.split(''); // J and Z need motion and are evaluated separately

export function evaluate(samples, labels = null) {
  const set = labels || [...new Set(samples.map((s) => s.label))].sort();
  const total = samples.length;
  if (!total) return { total: 0, labels: set, accuracy: null, answeredAccuracy: null, rejectionRate: null, perLetter: [], matrix: {}, confusions: [], byMeta: {} };

  const matrix = {}; // matrix[true][predicted | 'rejected'] = count
  set.forEach((l) => { matrix[l] = {}; });
  let correct = 0; let rejected = 0;
  samples.forEach((s) => {
    const row = (matrix[s.label] ||= {});
    const key = s.predicted === null || s.predicted === undefined ? 'rejected' : s.predicted;
    row[key] = (row[key] || 0) + 1;
    if (key === 'rejected') rejected += 1;
    else if (key === s.label) correct += 1;
  });
  const answered = total - rejected;

  const perLetter = set.map((l) => {
    const support = samples.filter((s) => s.label === l).length;
    const tp = matrix[l]?.[l] || 0;
    const predictedAsL = samples.filter((s) => s.predicted === l).length;
    const rej = matrix[l]?.rejected || 0;
    const precision = predictedAsL ? tp / predictedAsL : null;
    const recall = support ? tp / support : null;
    const f1 = precision && recall ? (2 * precision * recall) / (precision + recall) : (precision === 0 || recall === 0 ? 0 : null);
    return { letter: l, support, correct: tp, rejected: rej, precision, recall, f1 };
  });

  const confusions = [];
  Object.entries(matrix).forEach(([t, row]) => Object.entries(row).forEach(([p, n]) => { if (p !== t && p !== 'rejected') confusions.push({ true: t, predicted: p, count: n }); }));
  confusions.sort((a, b) => b.count - a.count);

  // The same accuracy broken down by the conditions each sample was recorded in (lighting, camera, distance...).
  const byMeta = {};
  ['signer', 'lighting', 'camera', 'background', 'distance', 'orientation'].forEach((key) => {
    const groups = {};
    samples.forEach((s) => { const v = (s.meta && s.meta[key]) || 'unspecified'; (groups[v] ||= []).push(s); });
    byMeta[key] = Object.entries(groups).map(([value, list]) => ({
      value, samples: list.length,
      accuracy: list.filter((s) => s.predicted === s.label).length / list.length,
      rejectionRate: list.filter((s) => s.predicted === null || s.predicted === undefined).length / list.length,
    }));
  });

  return {
    total, labels: set,
    accuracy: correct / total,                       // correct / all samples (a rejection counts as not correct)
    answeredAccuracy: answered ? correct / answered : null, // correct / samples where it gave an answer
    rejectionRate: rejected / total,
    perLetter, matrix, confusions, byMeta,
  };
}

const pct = (v) => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(1)}%`);

// A readable report for a README, a thesis or a bug report.
export function toMarkdown(report, title = 'Sign recognition evaluation') {
  if (!report.total) return `# ${title}\n\nNo samples were provided, so there is nothing to report.\n`;
  const lines = [`# ${title}`, '', `Samples: **${report.total}** across ${report.labels.length} letters.`, '',
    `| Measure | Value |`, `|---|---|`,
    `| Accuracy (correct / all samples) | ${pct(report.accuracy)} |`,
    `| Accuracy when it answered | ${pct(report.answeredAccuracy)} |`,
    `| Rejection rate (declined to answer) | ${pct(report.rejectionRate)} |`, '',
    '## Per letter', '', '| Letter | Samples | Correct | Rejected | Precision | Recall | F1 |', '|---|---|---|---|---|---|---|',
    ...report.perLetter.map((p) => `| ${p.letter} | ${p.support} | ${p.correct} | ${p.rejected} | ${pct(p.precision)} | ${pct(p.recall)} | ${pct(p.f1)} |`)];
  if (report.confusions.length) {
    lines.push('', '## Most common confusions', '', '| True | Predicted | Count |', '|---|---|---|', ...report.confusions.slice(0, 15).map((c) => `| ${c.true} | ${c.predicted} | ${c.count} |`));
  }
  lines.push('', '## Confusion matrix (rows = true letter, columns = predicted)', '');
  const cols = [...new Set([...report.labels, ...Object.values(report.matrix).flatMap((r) => Object.keys(r))])].filter((c) => c !== 'rejected').sort().concat('rejected');
  lines.push(`| true \\ pred | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
  report.labels.forEach((t) => lines.push(`| **${t}** | ${cols.map((c) => report.matrix[t]?.[c] || 0).join(' | ')} |`));
  lines.push('', '## By recording condition', '');
  Object.entries(report.byMeta).forEach(([key, groups]) => {
    if (groups.length <= 1 && groups[0]?.value === 'unspecified') return;
    lines.push(`**${key}**`, '', '| Value | Samples | Accuracy | Rejected |', '|---|---|---|---|', ...groups.map((g) => `| ${g.value} | ${g.samples} | ${pct(g.accuracy)} | ${pct(g.rejectionRate)} |`), '');
  });
  lines.push('_Numbers come only from the samples listed above. They describe those people, cameras and conditions, not every user._');
  return `${lines.join('\n')}\n`;
}

// ── Re-running a recorded sample through the CURRENT recogniser ──────────────
// A sample stores the raw landmarks of the frames it was recorded from, so after improving the classifier the same
// real recordings can be re-scored (repeatable evaluation) without asking anyone to sign again.
import { classifyLetter } from './fingerspelling.js';
import { VoteWindow } from './recognition.js';

const toPoints = (flat) => Array.from({ length: 21 }, (_, i) => ({ x: flat[i * 2], y: flat[i * 2 + 1] }));

// -> { predicted: letter | null, confidence }   (null = the recogniser would have declined to answer)
export function repredict(sample) {
  if (!Array.isArray(sample.frames) || !sample.frames.length) return { predicted: sample.predicted ?? null, confidence: sample.confidence ?? 0, rerun: false };
  const window = new VoteWindow();
  let last = { label: null, confidence: 0, ready: false };
  sample.frames.forEach((flat) => {
    const found = classifyLetter(toPoints(flat));
    window.push(found ? found.letter : null, found ? found.confidence : 0);
    const g = window.get();
    if (g.ready && !last.ready) last = g; // the first moment it would have typed a letter
  });
  const final = last.ready ? last : window.get();
  return { predicted: final.ready ? final.label : null, confidence: final.confidence, rerun: true };
}
