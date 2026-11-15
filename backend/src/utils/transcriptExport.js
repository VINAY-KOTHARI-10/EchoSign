// src/utils/transcriptExport.js
// Pure functions that turn caption rows into TXT, SRT and a print-ready HTML page. No database access, so they are easy to test.
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

const startOf = (captions) => (captions.length ? new Date(captions[0].createdAt).getTime() : 0);
const SOURCE_LABEL = { SPEECH: 'speech', SIGN: 'sign', TEXT: 'typed' };

const toTxt = (classroom, captions) => {
  const t0 = startOf(captions);
  const head = [
    classroom.title,
    `Class code: ${classroom.code}`,
    `Date: ${new Date(classroom.createdAt).toISOString().slice(0, 10)}`,
    `Captions: ${captions.length}`,
    '',
  ];
  const lines = captions.map((c) => `[${clock(new Date(c.createdAt).getTime() - t0)}] ${c.speakerName} (${SOURCE_LABEL[c.source] || c.source}): ${c.text}`);
  return `${head.concat(lines).join('\n')}\n`;
};

// Each caption is shown until the next one starts (or for a reading-time estimate when it is the last or the gap is long).
const toSrt = (captions) => {
  const t0 = startOf(captions);
  return captions.map((c, i) => {
    const start = new Date(c.createdAt).getTime() - t0;
    const readMs = Math.min(7000, Math.max(1500, c.text.split(/\s+/).length * 400));
    const next = captions[i + 1] ? new Date(captions[i + 1].createdAt).getTime() - t0 : start + readMs;
    const end = Math.min(next, start + 8000) > start + 500 ? Math.min(next, start + 8000) : start + readMs;
    return `${i + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${c.speakerName}: ${c.text}\n`;
  }).join('\n');
};

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// Standalone HTML with no script (so it works under a strict CSP). The app opens it and calls print(); the user
// chooses "Save as PDF" in the browser, so no server-side PDF engine is needed.
const toPrintHtml = (classroom, captions, summary) => {
  const t0 = startOf(captions);
  const notes = summary?.notes?.length
    ? `<h2>Notes</h2><ul>${summary.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
  const rows = captions.map((c) => `<tr><td>${clock(new Date(c.createdAt).getTime() - t0)}</td><th scope="row">${esc(c.speakerName)}</th><td>${esc(c.text)}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(classroom.title)} transcript</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:800px;margin:24px auto;padding:0 16px;color:#111}h1{margin-bottom:0}p.meta{color:#444;margin-top:4px}
table{border-collapse:collapse;width:100%}td,th{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}td:first-child{white-space:nowrap;color:#555;width:70px}th{font-weight:600;width:130px}
@media print{body{margin:0}}</style></head><body>
<h1>${esc(classroom.title)}</h1><p class="meta">Class code ${esc(classroom.code)} · ${esc(new Date(classroom.createdAt).toISOString().slice(0, 10))} · ${captions.length} captions</p>
${notes}<h2>Transcript</h2><table><caption class="sr-only" style="display:none">Transcript</caption><tbody>${rows}</tbody></table>
</body></html>`;
};

module.exports = { toTxt, toSrt, toPrintHtml, srtTime, clock };
