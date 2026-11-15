// src/utils/lectureAi.js
// Lecture notes and "ask your lecture", built on the Groq helper. The chat function and the transcript source are passed
// in, so every path (streaming, retries, hierarchical reduction, retrieval, fallbacks) is testable with no AI service.
//
// Nothing here loads a whole lecture into memory:
//   * summarizeLecture() consumes the transcript page by page, condenses each chunk as it arrives and keeps only the small
//     condensed result (long lectures are then reduced in several levels);
//   * askLecture() asks the transcript source for matching captions (filtered by the database, scored page by page) and
//     fetches a little context around the best ones.
// The result always says how much was covered: coverage 'complete' | 'partial' | 'fallback'.
'use strict';

const { clock } = require('./transcriptExport');

const STOP = new Set('the a an and or but of to in on for with is are was were be been it this that as at by from we you i they he she not do does did have has had will would can could should so if then than also about into over just what which who how when where why there their our your its them these those tell me explain mean means please said say about lecture teacher class'.split(' '));
const words = (s) => (String(s).toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || []).filter((w) => !STOP.has(w));

const DEFAULT_LIMITS = {
  chunkChars: 20000,   // size of one condensed piece of transcript (about 5k tokens)
  chunkRetries: 2,     // extra attempts for a chunk whose AI reply fails or is unusable
  maxChunks: 120,      // beyond this many chunks the rest is handled by the labelled extractive fallback
  budgetMs: 100000,    // time budget for the whole summary; when it runs out the rest uses the fallback
  fanIn: 8,            // condensed parts combined per reduction call
  reduceChars: 14000,  // condensed text must fit in this before the final call
  maxHits: 12, maxScan: 50000, contextBefore: 1, contextAfter: 1, maxLines: 60, sampleMoments: 12,
};

// ── Formatting ───────────────────────────────────────────────────────────────
const lineOf = (c, t0, n) => `[#${n} ${clock(new Date(c.createdAt).getTime() - t0)}] ${c.speakerName}: ${c.text}`;

// ── Validation of model output ───────────────────────────────────────────────
const str = (v, max = 400) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const strList = (v, max, len = 300) => (Array.isArray(v) ? v : []).map((x) => str(x && typeof x === 'object' ? (x.text || x.point || '') : x, len)).filter(Boolean).slice(0, max);

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
  return { notes, keyTerms: cleanTerms(ai.keyTerms), takeaways: strList(ai.takeaways, 6), revision: strList(ai.revision, 8), quiz: cleanQuiz(ai.quiz) };
};

// A chunk or combine reply must contain at least one real point; anything else is a failure (never silently dropped).
const validatePart = (ai) => {
  const points = strList(ai && (ai.points || ai.notes), 10);
  return points.length ? { points, terms: cleanTerms(ai.terms || ai.keyTerms, 6) } : null;
};

// ── Non-AI extraction (always labelled "basic" / "extract") ──────────────────
const sentencesOf = (text) => text.split(/(?<=[.!?])\s+/).filter((s) => s.split(' ').length >= 5);

const basicFromSample = (sentences, termCounts, fallbackLines) => {
  const terms = [...termCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([term]) => ({ term, definition: '' }));
  const step = Math.max(1, Math.floor(sentences.length / 8));
  const notes = sentences.filter((_, i) => i % step === 0).slice(0, 8).map((s) => str(s, 300));
  return { notes: notes.length ? notes : fallbackLines.slice(0, 6).map((s) => str(s, 300)), keyTerms: terms, takeaways: [], revision: [], quiz: [] };
};

// Whole-array convenience (small inputs and tests).
const basicSummary = (captions) => {
  const counts = new Map();
  words(captions.map((c) => c.text).join(' ')).forEach((w) => { if (w.length > 3) counts.set(w, (counts.get(w) || 0) + 1); });
  return basicFromSample(sentencesOf(captions.map((c) => c.text).join(' ')), counts, captions.map((c) => c.text));
};

// A bounded, evenly spread sample of the lecture's sentences plus word counts, kept while streaming so a non-AI summary
// still reflects the whole lecture. When the sample is full every other entry is dropped and the stride doubles.
class Sampler {
  constructor(max = 400) { this.max = max; this.sentences = []; this.stride = 1; this.i = 0; this.counts = new Map(); this.firstLines = []; }
  add(text) {
    if (this.firstLines.length < 6) this.firstLines.push(text);
    words(text).forEach((w) => { if (w.length > 3) this.counts.set(w, (this.counts.get(w) || 0) + 1); });
    if (this.counts.size > 8000) { [...this.counts.entries()].sort((a, b) => a[1] - b[1]).slice(0, 4000).forEach(([k]) => this.counts.delete(k)); }
    sentencesOf(text).forEach((s) => {
      if (this.i % this.stride === 0) { this.sentences.push(s); if (this.sentences.length > this.max) { this.sentences = this.sentences.filter((_, k) => k % 2 === 0); this.stride *= 2; } }
      this.i += 1;
    });
  }
  summary() { return basicFromSample(this.sentences, this.counts, this.firstLines); }
}

// ── Prompts ──────────────────────────────────────────────────────────────────
const SUMMARY_SYSTEM = 'You write study material from a classroom transcript. Reply ONLY with JSON: {"notes": [6-10 concise structured bullet points], "keyTerms": [{"term": string, "definition": string} ...up to 10, definitions only from the transcript], "takeaways": [3-5 main takeaways], "revision": [4-6 short revision points], "quiz": [5-10 multiple-choice questions: {"question": string, "options": [exactly 4 strings], "answerIndex": 0-3, "explanation": one sentence}]}. Use ONLY facts stated in the transcript. If something was not covered, do not add it.';
const CHUNK_SYSTEM = 'You read one part of a long classroom transcript. Reply ONLY with JSON: {"points": [up to 8 factual bullet points from this part], "terms": [{"term": string, "definition": string} ...up to 5, only if the speaker defined or explained it]}. Use only what is in this part.';
const COMBINE_SYSTEM = 'You combine condensed notes from several consecutive parts of one lecture. Reply ONLY with JSON: {"points": [up to 10 factual bullet points covering all the parts, in lecture order], "terms": [{"term": string, "definition": string} ...up to 8]}. Use only what the notes say.';

const partText = (p) => `Part ${p.index} (${p.from} to ${p.to}${p.status === 'fallback' ? ', extract only, the AI could not read this part' : ''}):\n- ${p.points.join('\n- ')}${p.terms.length ? `\nTerms: ${p.terms.map((t) => `${t.term}: ${t.definition}`).join('; ')}` : ''}`;

// Ask `chat` up to 1 + retries times until `validate` accepts the reply. Returns the validated value or null.
async function ask(chat, system, user, opts, validate, retries) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const out = validate(await chat(system, user, opts));
      if (out) return out;
    } catch (err) { if (attempt === retries) return { error: err.message }; }
  }
  return null;
}

// ── Lecture summary (streaming, hierarchical) ────────────────────────────────
// `pages` is an async (or sync) iterable of arrays of { id, speakerName, text, createdAt } in lecture order.
async function summarizeLecture({ classroom, pages, captions, chat, limits = {}, now = () => Date.now() }) {
  const L = { ...DEFAULT_LIMITS, ...limits };
  const source = pages || [captions || []];
  const started = now();
  const sampler = new Sampler();
  const parts = [];          // condensed chunks: { index, from, to, status: 'ai' | 'fallback', points, terms }
  let t0 = null; let n = 0; let lastCaptionId = null; let chunkIndex = 0;
  let cur = []; let curChars = 0; let curFrom = ''; let curTo = '';
  let failedChunks = 0; let overBudget = false; let overChunks = false;
  const failedRanges = [];
  let lastError = '';

  const condense = async (lines, from, to) => {
    chunkIndex += 1;
    const index = chunkIndex;
    const fallbackPart = () => {
      const pts = sentencesOf(lines.join(' ')).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 4)) === 0).slice(0, 4).map((s) => str(s.replace(/^\[#\d+ [\d:]+\] [^:]+: /, ''), 300));
      return { index, from, to, status: 'fallback', points: pts.length ? pts : [str(lines[0] || '', 300)].filter(Boolean), terms: [] };
    };
    if (!chat) { parts.push(fallbackPart()); return; }
    if (now() - started > L.budgetMs) { overBudget = true; failedChunks += 1; failedRanges.push([from, to]); parts.push(fallbackPart()); return; }
    if (index > L.maxChunks) { overChunks = true; failedChunks += 1; failedRanges.push([from, to]); parts.push(fallbackPart()); return; }
    const out = await ask(chat, CHUNK_SYSTEM, lines.join('\n'), { maxTokens: 900, temperature: 0.2 }, validatePart, L.chunkRetries);
    if (out && out.points) parts.push({ index, from, to, status: 'ai', ...out });
    else { failedChunks += 1; failedRanges.push([from, to]); if (out && out.error) lastError = out.error; parts.push(fallbackPart()); }
  };

  // The first chunk is held back until a second one arrives: a short lecture (one chunk) is summarised directly from its
  // transcript in a single request, with no intermediate condensing.
  let pending = null;
  const flush = async () => {
    if (!cur.length) return;
    const chunk = { lines: cur, from: curFrom, to: curTo };
    cur = []; curChars = 0;
    if (!pending && !parts.length) { pending = chunk; return; }
    if (pending) { const p = pending; pending = null; await condense(p.lines, p.from, p.to); }
    await condense(chunk.lines, chunk.from, chunk.to);
  };

  for await (const page of source) {
    for (const c of page) {
      if (t0 === null) t0 = new Date(c.createdAt).getTime();
      n += 1; lastCaptionId = c.id;
      sampler.add(c.text);
      const line = lineOf(c, t0, n);
      if (cur.length && curChars + line.length > L.chunkChars) await flush();
      if (!cur.length) curFrom = clock(new Date(c.createdAt).getTime() - t0);
      cur.push(line); curChars += line.length + 1;
      curTo = clock(new Date(c.createdAt).getTime() - t0);
    }
  }
  await flush();
  const single = pending && !parts.length ? pending : null; // the whole lecture fitted in one chunk

  const meta = { captionCount: n, lastCaptionId, chunks: single ? 1 : parts.length, failedChunks };
  const fallback = (reason, extra = {}) => ({
    ...sampler.summary(), provider: 'basic', coverage: 'fallback', fallbackReason: reason, levels: 0, ...meta, ...extra,
  });
  if (!chat) return fallback('AI is not configured on this server');
  if (!parts.length && !single) return fallback('There was nothing to summarise');
  if (!single && parts.every((p) => p.status === 'fallback')) return fallback(`The AI could not read any part of the lecture${lastError ? ` (${lastError})` : ''}`);

  // Reduce in levels until the condensed text fits one request.
  let level = single ? [] : parts;
  let levels = 0;
  let reduceFailures = 0;
  const size = (items) => items.reduce((s, p) => s + partText(p).length, 0);
  while (level.length > 1 && size(level) > L.reduceChars && levels < 6) {
    const next = [];
    for (let i = 0; i < level.length; i += L.fanIn) {
      const group = level.slice(i, i + L.fanIn);
      const out = group.length === 1 ? null : await ask(chat, COMBINE_SYSTEM, group.map(partText).join('\n\n'), { maxTokens: 1000, temperature: 0.2 }, validatePart, L.chunkRetries);
      const idx = next.length + 1;
      if (out && out.points) next.push({ index: idx, from: group[0].from, to: group[group.length - 1].to, status: group.some((g) => g.status === 'fallback') ? 'fallback' : 'ai', ...out });
      else {
        if (group.length > 1) { reduceFailures += 1; if (out && out.error) lastError = out.error; }
        // keep the group's strongest points rather than dropping it
        next.push({ index: idx, from: group[0].from, to: group[group.length - 1].to, status: 'fallback', points: group.flatMap((g) => g.points).slice(0, 10), terms: group.flatMap((g) => g.terms).slice(0, 8) });
      }
    }
    level = next; levels += 1;
  }

  const header = `Class: ${classroom.title}\nKeywords: ${(classroom.keywords || []).join(', ')}\n\n`;
  const material = single ? single.lines.join('\n') : level.map(partText).join('\n\n');
  const label = single ? `Transcript (${meta.captionCount} captions):` : `Condensed transcript (${meta.captionCount} captions, ${parts.length} parts):`;
  const final = await ask(chat, SUMMARY_SYSTEM, `${header}${label}\n${material}`,{ maxTokens: 2600, temperature: 0.3 }, validateSummary, L.chunkRetries);
  if (!final || final.error) return fallback(final && final.error ? `AI request failed: ${final.error}` : 'The AI reply was not in the expected format', { levels });

  const partial = failedChunks > 0 || reduceFailures > 0 || overBudget || overChunks;
  const reasons = [];
  if (overBudget) reasons.push('the time limit was reached, so the remaining parts use an extract instead of AI');
  if (overChunks) reasons.push(`the lecture is longer than ${L.maxChunks} parts, so the rest uses an extract instead of AI`);
  if (failedChunks && !overBudget && !overChunks) reasons.push(`${failedChunks} of ${parts.length} parts could not be read by the AI after retries and use an extract instead`);
  if (reduceFailures) reasons.push(`${reduceFailures} combining step${reduceFailures === 1 ? '' : 's'} failed and kept the strongest points`);
  return {
    ...final, provider: 'groq', coverage: partial ? 'partial' : 'complete', levels, ...meta,
    ...(partial ? { partialReason: `${reasons.join('; ')}.`, failedRanges: failedRanges.slice(0, 20) } : {}),
  };
}

// ── Ask your lecture ─────────────────────────────────────────────────────────
// A transcript source answers four questions about one lecture without exposing all of it at once:
//   total() -> number            firstAt() -> Date | null
//   scan(keywords) -> async iterable of pages of captions containing ANY keyword (database-filtered, bounded pages)
//   around(caption, before, after) -> captions around one caption, in order, including it
//   sample(k) -> k captions spread evenly across the lecture
const ASK_SYSTEM = 'You answer a student question about a lecture using ONLY the transcript lines and notes provided. Reply ONLY with JSON: {"answer": string, "references": [line numbers you used, e.g. 3], "covered": true|false}. If the transcript does not contain the answer, set covered to false and say the lecture did not cover it; do not use outside knowledge to state what the teacher said. You may give a simple explanation or an example, but label anything not from the lecture as "Extra explanation (not from the lecture)".';
const EXTRA = /extra explanation \(not from the lecture\)/i;

const keywordsOf = (question, max = 8) => [...new Set(words(question))].sort((a, b) => b.length - a.length).slice(0, max);

// How well one caption matches the question (more distinct keywords, and the whole phrase, score higher).
const scoreOf = (text, keywords, question) => {
  const w = new Set(words(text));
  let hit = 0; keywords.forEach((k) => { if (w.has(k)) hit += 1; });
  const phrase = question.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
  return hit + (phrase.length > 8 && text.toLowerCase().includes(phrase) ? 2 : 0);
};

async function askLecture({ classroom, source, captions, notes, question, chat, limits = {} }) {
  const L = { ...DEFAULT_LIMITS, ...limits };
  const src = source || memorySource(captions || []);
  const q = str(question, 500);
  const total = await src.total();
  const first = await src.firstAt();
  const t0 = first ? new Date(first).getTime() : 0;
  const at = (c) => clock(new Date(c.createdAt).getTime() - t0);
  const keywords = keywordsOf(q);

  let picked = []; let mode = 'searched'; let matches = 0; let scanned = 0; let complete = true;
  if (keywords.length) {
    // Score every matching caption, page by page, keeping only the best few (memory stays small).
    let best = [];
    for await (const page of src.scan(keywords)) {
      for (const c of page) {
        scanned += 1; matches += 1;
        const score = scoreOf(c.text, keywords, q);
        if (best.length < L.maxHits || score > best[best.length - 1].score) {
          best.push({ c, score }); best.sort((a, b) => b.score - a.score || new Date(a.c.createdAt) - new Date(b.c.createdAt)); best = best.slice(0, L.maxHits);
        }
      }
      if (scanned >= L.maxScan) { complete = false; break; }
    }
    picked = best.map((b) => b.c);
  } else {
    // A general question ("explain the main idea") has no keywords to search for: use the notes and evenly spread moments.
    mode = 'sampled';
    picked = await src.sample(L.sampleMoments);
    matches = picked.length;
  }

  const coverage = {
    mode, totalCaptions: total, matches, complete,
    note: mode === 'sampled'
      ? `This is a general question, so the answer uses ${notes && notes.notes && notes.notes.length ? 'the saved notes and ' : ''}${picked.length} moments spread across the lecture, not the whole transcript.`
      : complete ? `Searched all ${total} captions.` : `Searched the first ${scanned} matching captions out of a larger number; some matches were not examined.`,
  };

  // Local line numbers 1..K are what the model cites; each one maps to a real caption of this class.
  const byId = new Map();
  for (const c of picked) {
    const windowLines = await src.around(c, L.contextBefore, L.contextAfter);
    windowLines.forEach((w) => byId.set(w.id, w));
  }
  const lines = [...byId.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || (a.id < b.id ? -1 : 1)).slice(0, L.maxLines)
    .map((c, i) => ({ n: i + 1, id: c.id, at: at(c), speaker: c.speakerName, text: c.text, line: `[#${i + 1} ${at(c)}] ${c.speakerName}: ${c.text}` }));
  const refs = (nums) => nums.map((n) => lines.find((l) => l.n === n)).filter(Boolean).map((l) => ({ n: l.n, id: l.id, at: l.at, speaker: l.speaker, text: l.text }));

  const hitIds = new Set(picked.map((c) => c.id));
  const hitLines = lines.filter((l) => hitIds.has(l.id));
  const extractive = (reason) => ({
    provider: 'search', covered: mode === 'searched' && hitLines.length > 0, fallbackReason: reason, coverage,
    answer: mode === 'sampled'
      ? 'AI answers are unavailable right now, and a general question cannot be answered by searching. Ask about a specific word or topic, or try again later.'
      : hitLines.length ? 'AI answers are unavailable right now. These are the moments in the lecture that mention your question:' : 'The lecture does not seem to mention this.',
    references: mode === 'searched' ? refs(hitLines.slice(0, 5).map((l) => l.n)) : [],
  });

  if (mode === 'searched' && !lines.length) return { provider: chat ? 'groq' : 'search', covered: false, answer: 'The lecture does not seem to mention this.', references: [], coverage };
  if (!chat) return extractive('AI is not configured on this server');

  try {
    const noteText = notes && notes.notes && notes.notes.length ? `\n\nTeacher notes (${notes.provider === 'basic' ? 'extract' : 'AI-generated'}):\n- ${notes.notes.slice(0, 10).join('\n- ')}` : '';
    const ai = await chat(ASK_SYSTEM, `Class: ${classroom.title}\n\nTranscript lines:\n${lines.map((l) => l.line).join('\n') || '(none)'}${noteText}\n\nQuestion: ${q}`, { maxTokens: 700, temperature: 0.2 });
    const answer = str(ai && ai.answer, 1500);
    if (!answer) return extractive('The AI reply was not in the expected format');
    const valid = new Set(lines.map((l) => l.n));
    const nums = (Array.isArray(ai.references) ? ai.references : []).map(Number).filter((n) => valid.has(n)).slice(0, 6);
    return { provider: 'groq', covered: ai.covered !== false, answer, references: refs(nums), extraExplanation: EXTRA.test(answer), coverage };
  } catch (err) {
    return extractive(`AI request failed: ${err.message}`);
  }
}

// In-memory transcript source (small lectures, tests). The database-backed one is in lectureSource.js.
function memorySource(captions) {
  const sorted = [...captions].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || (a.id < b.id ? -1 : 1));
  return {
    total: async () => sorted.length,
    firstAt: async () => (sorted[0] ? sorted[0].createdAt : null),
    async* scan(keywords) {
      const ks = keywords.map((k) => k.toLowerCase());
      const hits = sorted.filter((c) => ks.some((k) => c.text.toLowerCase().includes(k)));
      for (let i = 0; i < hits.length; i += 1000) yield hits.slice(i, i + 1000);
    },
    around: async (c, before, after) => { const i = sorted.findIndex((x) => x.id === c.id); return sorted.slice(Math.max(0, i - before), i + after + 1); },
    sample: async (k) => (sorted.length <= k ? sorted : Array.from({ length: k }, (_, i) => sorted[Math.floor((i * sorted.length) / k)])),
  };
}

// ── Compatibility helpers (used by tests and small callers) ──────────────────
const numbered = (captions) => {
  const t0 = captions.length ? new Date(captions[0].createdAt).getTime() : 0;
  return captions.map((c, i) => ({ n: i + 1, id: c.id, speaker: c.speakerName, text: c.text, at: clock(new Date(c.createdAt).getTime() - t0), line: lineOf(c, t0, i + 1) }));
};
const chunkCaptions = (captions, maxChars = 9000) => {
  const chunks = []; let cur = []; let size = 0;
  for (const c of numbered(captions)) {
    if (cur.length && size + c.line.length > maxChars) { chunks.push(cur); cur = []; size = 0; }
    cur.push(c); size += c.line.length + 1;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
};

module.exports = {
  summarizeLecture, askLecture, memorySource, chunkCaptions, numbered, validateSummary, validatePart, basicSummary, cleanQuiz,
  keywordsOf, scoreOf, DEFAULT_LIMITS,
};
