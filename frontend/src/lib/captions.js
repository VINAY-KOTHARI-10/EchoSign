// Helpers for caption text: formatting, export, highlighting, alerts.

export const SOURCE_ICON = { SIGN: ' 🤟', TEXT: ' ⌨️', SPEECH: '' };
export const SOURCE_LABEL = { SIGN: ' (sign)', TEXT: ' (typed)', SPEECH: '' };

const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');

// 3723.5 s -> "01:02:03,500" (SRT) or "01:02:03.500" (WebVTT)
export const srtTime = (seconds, sep = ',') => {
  const s = Math.max(0, seconds);
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}${sep}${pad((s % 1) * 1000, 3)}`;
};

// Each caption lasts until the next one starts, but never shorter than 1.5 s or longer than 8 s.
export function buildSrt(captions, originMs) {
  const origin = originMs ?? (captions[0] ? new Date(captions[0].createdAt).getTime() : 0);
  const rows = [];
  captions.forEach((c, i) => {
    const start = (new Date(c.createdAt).getTime() - origin) / 1000;
    if (start < 0) return; // before the recording started
    const next = captions[i + 1] ? (new Date(captions[i + 1].createdAt).getTime() - origin) / 1000 : start + 4;
    const words = c.text.split(/\s+/).length;
    const end = Math.min(start + 8, Math.max(start + 1.5, Math.min(next - 0.05, start + 0.45 * words + 1)));
    rows.push(`${rows.length + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${c.speakerName}${SOURCE_LABEL[c.source] || ''}: ${c.text}\n`);
  });
  return rows.join('\n');
}

export const timeOf = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const buildTranscriptText = (room, captions) =>
  `${room.title}\nClass code ${room.code}\n\n` +
  captions.map((c) => `[${timeOf(c.createdAt)}] ${c.speakerName}${SOURCE_LABEL[c.source] || ''}: ${c.text}`).join('\n') + '\n';

export const downloadText = (filename, text, type = 'text/plain') => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

export const safeName = (s) => String(s).replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'class';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Opens the browser's print dialog for a clean copy of the transcript (choose "Save as PDF").
export function printHtml(title, bodyHtml) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font:14px/1.6 system-ui,sans-serif;color:#17131f;margin:32px}
    h1{font-size:22px;margin:0 0 4px} .meta{color:#6b6478;margin-bottom:20px}
    .line{margin:0 0 8px;break-inside:avoid} .who{font-weight:700} .t{color:#6b6478;font-size:12px;margin-right:6px}
    h2{font-size:16px;margin:22px 0 6px} li{margin:3px 0}
  </style></head><body>${bodyHtml}</body></html>`);
  doc.close();
  frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 2000); };
  // Some browsers do not fire onload for document.write; print anyway after a tick.
  setTimeout(() => { try { frame.contentWindow.print(); } catch { /* already printed */ } }, 600);
}

export const transcriptHtml = (room, captions) =>
  `<h1>${esc(room.title)}</h1><div class="meta">Class code ${esc(room.code)} · ${captions.length} captions</div>` +
  captions.map((c) => `<p class="line"><span class="t">${esc(timeOf(c.createdAt))}</span><span class="who">${esc(c.speakerName)}${esc(SOURCE_LABEL[c.source] || '')}:</span> ${esc(c.text)}</p>`).join('');

// ── Highlighting ───────────────────────────────────────────────────────────
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Splits text into [{ text, hit }] so React can wrap keyword / search matches in <mark>.
export function splitHighlights(text, terms) {
  const list = (terms || []).map((t) => t.trim()).filter(Boolean);
  if (!list.length) return [{ text, hit: false }];
  // With one capture group, split() puts the matches at the odd indexes.
  const parts = text.split(new RegExp(`(${list.map(reEsc).join('|')})`, 'i'));
  return parts.map((p, i) => ({ text: p, hit: i % 2 === 1 })).filter((p) => p.text !== '');
}

// ── Alerts ─────────────────────────────────────────────────────────────────
const QUESTION_START = /^(who|what|when|where|why|how|which|can|could|would|will|do|does|did|is|are|am|was|were|should|may|shall)\b/i;
export const isQuestion = (text) => /\?\s*$/.test(text.trim()) || QUESTION_START.test(text.trim());

// Why (if at all) should this caption alert the viewer? Returns 'name' | 'word' | 'question' | null.
export function alertReason(text, { username, words = [], question = false }) {
  const lower = text.toLowerCase();
  const wordHit = (w) => w && new RegExp(`\\b${reEsc(w.toLowerCase())}\\b`).test(lower);
  if (wordHit(username)) return 'name';
  if (words.some(wordHit)) return 'word';
  if (question && isQuestion(text)) return 'question';
  return null;
}

export const csv = (rows) =>
  rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
