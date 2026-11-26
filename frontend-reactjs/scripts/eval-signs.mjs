// Repeatable evaluation of the sign recogniser on REAL recordings.
//   1. In the app: Sign Lab -> "Recognition test", record samples (with consent), press "Export samples".
//   2. node scripts/eval-signs.mjs samples-person1.json samples-person2.json [--stored] [--out report.md]
// By default every sample is re-scored with the CURRENT classifier from its raw landmarks, so you can improve the code
// and re-measure on the same recordings. --stored uses the prediction made at recording time instead.
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate, repredict, toMarkdown } from '../src/lib/evaluation.js';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, v && !v.startsWith('--') ? 2 : 1); return v || true; };
const out = flag('--out');
const stored = Boolean(flag('--stored'));
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) { console.error('Usage: node scripts/eval-signs.mjs <samples.json...> [--stored] [--out report.md]'); process.exit(1); }

const samples = files.flatMap((f) => {
  const data = JSON.parse(readFileSync(f, 'utf8'));
  return (data.samples || data).filter((s) => s.consent !== false);
});
const scored = samples.map((s) => (stored ? s : { ...s, ...repredict(s) }));
const report = evaluate(scored);
const md = toMarkdown(report, `Sign recognition evaluation (${stored ? 'stored predictions' : 're-scored with the current classifier'})`);
if (out) { writeFileSync(out, md); console.log(`Wrote ${out}`); } else console.log(md);
