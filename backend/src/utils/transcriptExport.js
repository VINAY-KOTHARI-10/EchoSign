// src/utils/transcriptExport.js
// TXT, SRT and print-ready HTML from caption rows. Two ways to use it:
//   * toTxt / toSrt / toPrintHtml build a whole string from an array (small transcripts, tests);
//   * the incremental helpers (txtHead, txtLine, srtCue, htmlHead, htmlRow, htmlTail) let the server stream a transcript of
//     any length one page at a time, with bounded memory. The array versions are built from them, so both give identical text.
'use strict';

const pad = (n, w = 2) => String(n).padStart(w, '0');

// 3725.4 seconds -> "01:02:05,400" (SRT timestamp)
const srtTime = (ms) => {
  const t = Math.max(0, Math.round(ms));
  return `${pad(Math.floor(t / 3600000))}:${pad(Math.floor((t % 3600000) / 60000))}:${pad(Math.floor((t % 60000) / 1000))},${pad(t % 1000, 3)}`;
};

// "12:05" or "1:02:05" for human-readable offsets from the start of the lecture
const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  return h ? `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};

const ms = (d) => new Date(d).getTime();
const SOURCE_LABEL = { SPEECH: 'speech', SIGN: 'sign', TEXT: 'typed' };

// ── TXT ──────────────────────────────────────────────────────────────────────
const txtHead = (classroom, count) => `${[
  classroom.title,
  `Class code: ${classroom.code}`,
  `Date: ${new Date(classroom.createdAt).toISOString().slice(0, 10)}`,
  `Captions: ${count}`,
  '',
].join('\n')}\n`;
const txtLine = (c, t0) => `[${clock(ms(c.createdAt) - t0)}] ${c.speakerName} (${SOURCE_LABEL[c.source] || c.source}): ${c.text}\n`;

// ── SRT ──────────────────────────────────────────────────────────────────────
// A cue is shown until the next caption starts, for at most 8 s, and for a reading-time estimate when the gap is tiny.
// `nextStartMs` is the next caption's offset from t0, or null for the last one.
const srtCue = (c, index, t0, nextStartMs) => {
  const start = ms(c.createdAt) - t0;
  const readMs = Math.min(7000, Math.max(1500, c.text.split(/\s+/).length * 400));
  const next = nextStartMs === null || nextStartMs === undefined ? start + readMs : nextStartMs;
  const end = Math.min(next, start + 8000) > start + 500 ? Math.min(next, start + 8000) : start + readMs;
  return `${index}\n${srtTime(start)} --> ${srtTime(end)}\n${c.speakerName}: ${c.text}\n`;
};

// ── HTML (print / save as PDF) ───────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// Standalone HTML with no script (so it works under a strict CSP). The app opens it and calls print(); the user
// chooses "Save as PDF" in the browser, so no server-side PDF engine is needed.
const htmlHead = (classroom, count, summary) => {
  const notes = summary && summary.notes && summary.notes.length
    ? `<h2>Notes</h2><ul>${summary.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(classroom.title)} transcript</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:800px;margin:24px auto;padding:0 16px;color:#111}h1{margin-bottom:0}p.meta{color:#444;margin-top:4px}
table{border-collapse:collapse;width:100%}td,th{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}td:first-child{white-space:nowrap;color:#555;width:70px}th{font-weight:600;width:130px}
@media print{body{margin:0}}</style></head><body>
<h1>${esc(classroom.title)}</h1><p class="meta">Class code ${esc(classroom.code)} · ${esc(new Date(classroom.createdAt).toISOString().slice(0, 10))} · ${count} captions</p>
${notes}<h2>Transcript</h2><table><caption class="sr-only" style="display:none">Transcript</caption><tbody>
`;
};
const htmlRow = (c, t0) => `<tr><td>${clock(ms(c.createdAt) - t0)}</td><th scope="row">${esc(c.speakerName)}</th><td>${esc(c.text)}</td></tr>\n`;
const htmlTail = () => '</tbody></table>\n</body></html>';

// ── whole-string versions ────────────────────────────────────────────────────
const startOf = (captions) => (captions.length ? ms(captions[0].createdAt) : 0);

const toTxt = (classroom, captions) => {
  const t0 = startOf(captions);
  return txtHead(classroom, captions.length) + captions.map((c) => txtLine(c, t0)).join('');
};

const toSrt = (captions) => {
  const t0 = startOf(captions);
  return captions.map((c, i) => srtCue(c, i + 1, t0, captions[i + 1] ? ms(captions[i + 1].createdAt) - t0 : null)).join('\n');
};

const toPrintHtml = (classroom, captions, summary) => {
  const t0 = startOf(captions);
  return htmlHead(classroom, captions.length, summary) + captions.map((c) => htmlRow(c, t0)).join('') + htmlTail();
};

module.exports = { toTxt, toSrt, toPrintHtml, srtTime, clock, txtHead, txtLine, srtCue, htmlHead, htmlRow, htmlTail };
