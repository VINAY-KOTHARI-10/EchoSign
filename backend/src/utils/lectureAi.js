// src/utils/lectureAi.js
// Lecture notes and "ask your lecture", built on the Groq helper. The chat function is passed in, so every path
// (chunking, validation, fallbacks) is testable without calling an AI service.
'use strict';

const { clock } = require('./transcriptExport');

const STOP = new Set('the a an and or but of to in on for with is are was were be been it this that as at by from we you i they he she not do does did have has had will would can could should so if then than also about into over just what which who how when where why there their our your its them these those tell me explain mean means please'.split(' '));
const words = (s) => (String(s).toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || []).filter((w) => !STOP.has(w));

// ── Transcript formatting ────────────────────────────────────────────────────
// Every caption gets a stable number (its position in the lecture) and an offset from the first caption.
const numbered = (captions) => {
  const t0 = captions.length ? new Date(captions[0].createdAt).getTime() : 0;
  return captions.map((c, i) => ({
    n: i + 1, id: c.id, speaker: c.speakerName, text: c.text,
    at: clock(new Date(c.createdAt).getTime() - t0),
    line: `[#${i + 1} ${clock(new Date(c.createdAt).getTime() - t0)}] ${c.speakerName}: ${c.text}`,
  }));
};

// Split a long lecture into pieces that each fit one request. Nothing is dropped.
const chunkCaptions = (captions, maxChars = 9000) => {
  const chunks = [];
  let cur = []; let size = 0;
  for (const c of numbered(captions)) {
    if (cur.length && size + c.line.length > maxChars) { chunks.push(cur); cur = []; size = 0; }
    cur.push(c); size += c.line.length + 1;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
};

// ── Validation of model output ───────────────────────────────────────────────
const str = (v, max = 400) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const strList = (v, max, len = 300) => (Array.isArray(v) ? v : []).map((x) => str(typeof x === 'object' ? (x.text || x.point || '') : x, len)).filter(Boolean).slice(0, max);

const cleanQuiz = (list, max = 10) => (Array.isArray(list) ? list : [])
  .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex <= 3)
  .slice(0, max)
  .map((q) => ({ question: str(q.question, 300), options: q.options.map((o) => str(o, 200)), answerIndex: q.answerIndex, explanation: str(q.explanation, 300) }));

const cleanTerms = (list, max = 12) => (Array.isArray(list) ? list : [])
  .map((t) => ({ term: str(t && t.term, 80), definition: str(t && t.definition, 300) })).filter((t) => t.term).slice(0, max);

// Returns a clean summary, or null when the model reply is unusable.
const validateSummary = (ai) => {
  if (!ai || typeof ai !== 'object') return null;
  const notes = strList(ai.notes, 12);
  if (!notes.length) return null;
  return {
    notes,
    keyTerms: cleanTerms(ai.keyTerms),
    takeaways: strList(ai.takeaways, 6),
    revision: strList(ai.revision, 8),
    quiz: cleanQuiz(ai.quiz),
  };
};

// ── Non-AI fallback (clearly labelled "basic") ───────────────────────────────
const basicSummary = (captions) => {
  const lines = captions.map((c) => c.text);
  const text = lines.join(' ');
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.split(' ').length >= 5);
  const freq = {};
  words(text).forEach((w) => { if (w.length > 3) freq[w] = (freq[w] || 0) + 1; });
  const terms = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([term]) => ({ term, definition: '' }));
  const step = Math.max(1, Math.floor(sentences.length / 8));
  const notes = sentences.filter((_, i) => i % step === 0).slice(0, 8).map((s) => str(s, 300));
  return { notes: notes.length ? notes : lines.slice(0, 6).map((s) => str(s, 300)), keyTerms: terms, takeaways: [], revision: [], quiz: [] };
};

// ── Lecture summary (chunked map-reduce) ─────────────────────────────────────
const SUMMARY_SYSTEM = 'You write study material from a classroom transcript. Reply ONLY with JSON: {"notes": [6-10 concise structured bullet points], "keyTerms": [{"term": string, "definition": string} ...up to 10, definitions only from the transcript], "takeaways": [3-5 main takeaways], "revision": [4-6 short revision points], "quiz": [5-10 multiple-choice questions: {"question": string, "options": [exactly 4 strings], "answerIndex": 0-3, "explanation": one sentence}]}. Use ONLY facts stated in the transcript. If something was not covered, do not add it.';
const CHUNK_SYSTEM = 'You read one part of a long classroom transcript. Reply ONLY with JSON: {"points": [up to 8 factual bullet points from this part], "terms": [{"term": string, "definition": string} ...up to 5, only if the speaker defined or explained it]}. Use only what is in this part.';

async function summarizeLecture({ classroom, captions, chat, maxChunkChars = 9000 }) {
  const meta = { captionCount: captions.length, lastCaptionId: captions.length ? captions[captions.length - 1].id : null };
  const header = `Class: ${classroom.title}\nKeywords: ${(classroom.keywords || []).join(', ')}\n\n`;

  const fallback = (reason) => ({ ...basicSummary(captions), provider: 'basic', fallbackReason: reason, chunks: 0, ...meta });
  if (!chat) return fallback('AI is not configured on this server');

  try {
    const chunks = chunkCaptions(captions, maxChunkChars);
    let material;
    if (chunks.length === 1) {
      material = chunks[0].map((c) => c.line).join('\n');
    } else {
      // Map: condense every chunk, so the whole lecture contributes, not only the beginning.
      const condensed = [];
      for (const chunk of chunks) {
        const part = await chat(CHUNK_SYSTEM, chunk.map((c) => c.line).join('\n'), { maxTokens: 900, temperature: 0.2 });
        const points = strList(part && part.points, 8);
        const terms = cleanTerms(part && part.terms, 5);
        if (points.length) condensed.push(`Part ${condensed.length + 1} (${chunk[0].at} to ${chunk[chunk.length - 1].at}):\n- ${points.join('\n- ')}${terms.length ? `\nTerms: ${terms.map((t) => `${t.term}: ${t.definition}`).join('; ')}` : ''}`);
      }
      if (!condensed.length) return fallback('The AI returned nothing usable for any part of the lecture');
      material = condensed.join('\n\n');
    }
    const ai = await chat(SUMMARY_SYSTEM, `${header}${chunks.length > 1 ? 'Condensed transcript (all parts):' : 'Transcript:'}\n${material}`, { maxTokens: 2600, temperature: 0.3 });
    const clean = validateSummary(ai);
    if (!clean) return fallback('The AI reply was not in the expected format');
    return { ...clean, provider: 'groq', chunks: chunks.length, ...meta };
  } catch (err) {
    return fallback(`AI request failed: ${err.message}`);
  }
}

// ── Ask your lecture ─────────────────────────────────────────────────────────
// Pick the captions most relevant to the question (word overlap, with the neighbouring lines for context).
const retrieve = (captions, question, limit = 40) => {
  const items = numbered(captions);
  const q = new Set(words(question));
  if (!q.size) return items.slice(0, limit);
  const scored = items.map((c) => {
    const w = new Set(words(c.text));
    let hit = 0; q.forEach((t) => { if (w.has(t)) hit += 1; });
    return { c, score: hit };
  });
  const keep = new Set();
  scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.ceil(limit / 3)).forEach(({ c }) => {
    for (let i = Math.max(1, c.n - 1); i <= Math.min(items.length, c.n + 1); i += 1) keep.add(i);
  });
  return [...keep].sort((a, b) => a - b).map((n) => items[n - 1]).slice(0, limit);
};

const ASK_SYSTEM = 'You answer a student question about a lecture using ONLY the transcript lines and notes provided. Reply ONLY with JSON: {"answer": string, "references": [caption numbers you used, e.g. 12], "covered": true|false}. If the transcript does not contain the answer, set covered to false and say the lecture did not cover it; do not use outside knowledge to state what the teacher said. You may give a simple explanation or an example, but label anything not from the lecture as "Extra explanation (not from the lecture)".';

async function askLecture({ classroom, captions, notes, question, chat }) {
  const q = str(question, 500);
  const lines = retrieve(captions, q);
  const references = (nums) => nums.map((n) => lines.find((l) => l.n === n)).filter(Boolean).map((l) => ({ n: l.n, id: l.id, at: l.at, speaker: l.speaker, text: l.text }));
  // Without AI, show the lines that actually contain the question's words (best matches first), not just their neighbours.
  const qWords = new Set(words(q));
  const hits = (l) => words(l.text).filter((w) => qWords.has(w)).length;
  const ranked = lines.filter((l) => hits(l) > 0).sort((x, y) => hits(y) - hits(x) || x.n - y.n);
  const extractive = (reason) => ({
    provider: 'search', covered: ranked.length > 0, fallbackReason: reason,
    answer: ranked.length ? 'AI answers are unavailable right now. These are the moments in the lecture that mention your question:' : 'The lecture does not seem to mention this.',
    references: references(ranked.slice(0, 5).map((l) => l.n)),
  });
  if (!chat) return extractive('AI is not configured on this server');
  if (!lines.length) return { provider: 'groq', covered: false, answer: 'The lecture does not seem to mention this.', references: [] };

  try {
    const context = lines.map((l) => l.line).join('\n');
    const noteText = notes && notes.notes && notes.notes.length ? `\n\nTeacher notes:\n- ${notes.notes.slice(0, 10).join('\n- ')}` : '';
    const ai = await chat(ASK_SYSTEM, `Class: ${classroom.title}\n\nTranscript lines:\n${context}${noteText}\n\nQuestion: ${q}`, { maxTokens: 700, temperature: 0.2 });
    const answer = str(ai && ai.answer, 1500);
    if (!answer) return extractive('The AI reply was not in the expected format');
    const valid = new Set(lines.map((l) => l.n));
    const nums = (Array.isArray(ai.references) ? ai.references : []).map(Number).filter((n) => valid.has(n)).slice(0, 6);
    return { provider: 'groq', covered: ai.covered !== false, answer, references: references(nums) };
  } catch (err) {
    return extractive(`AI request failed: ${err.message}`);
  }
}

module.exports = { chunkCaptions, numbered, validateSummary, basicSummary, summarizeLecture, retrieve, askLecture, cleanQuiz };
