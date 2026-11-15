// tests/lectureLong.test.js
// Long lectures: no silent truncation. Pages, summaries (retries, fallbacks, hierarchical reduction), question answering
// and exports are exercised on fixtures of 25,000 and 120,000 captions (well past the old 20,000 / 100,000 limits).
// The database is an in-memory stand-in with real cursor semantics; the real database is covered by `npm run e2e`.
'use strict';

const { makeCaptions, fakeCaptionDb, idOf } = require('./helpers/fakeCaptionDb');
const { pageCaptions, eachCaption } = require('../src/utils/captionPages');
const { prismaSource } = require('../src/utils/lectureSource');
const { summarizeLecture, askLecture, DEFAULT_LIMITS } = require('../src/utils/lectureAi');
const { streamTranscript } = require('../src/utils/transcriptStream');
const { toTxt, toSrt, toPrintHtml, clock } = require('../src/utils/transcriptExport');

const ROOM = { id: 'room-1', title: 'Physics', code: 'ABC234', keywords: ['force'], createdAt: new Date(Date.UTC(2026, 10, 14)) };
const SEL = { speakerName: true, text: true };
const pagesOf = (prisma, pageSize = 1000) => pageCaptions(prisma, ROOM.id, { select: SEL, pageSize });

// A fake AI that understands the three kinds of prompt. `script` can override behaviour per call.
const fakeChat = (script = {}) => {
  const calls = { chunk: 0, combine: 0, final: 0, ask: 0 };
  const chat = jest.fn(async (system, user) => {
    const kind = /one part of a long/.test(system) ? 'chunk' : /combine condensed notes/.test(system) ? 'combine' : /answer a student question/.test(system) ? 'ask' : 'final';
    calls[kind] += 1;
    if (script[kind]) { const out = script[kind](calls[kind], user); if (out !== undefined) { if (out instanceof Error) throw out; return out; } }
    if (kind === 'chunk' || kind === 'combine') return { points: [`point ${calls[kind]}`], terms: [] };
    if (kind === 'ask') return { answer: 'From the lecture.', references: [1], covered: true };
    return { notes: ['n1', 'n2'], keyTerms: [], takeaways: [], revision: [], quiz: [] };
  });
  return { chat, calls };
};

describe('cursor paging', () => {
  it('reads 120,000 captions (past the old 100,000 limit) once each, in order, with bounded pages', async () => {
    const rows = makeCaptions(120000);
    const { prisma, stats } = fakeCaptionDb(rows);
    let n = 0; let prev = null; let pages = 0;
    for await (const page of pageCaptions(prisma, ROOM.id, { pageSize: 1000 })) {
      pages += 1;
      for (const c of page) { expect(c.id).toBe(idOf(n)); if (prev) expect(c.createdAt >= prev).toBe(true); prev = c.createdAt; n += 1; }
    }
    expect(n).toBe(120000);
    expect(pages).toBe(120);
    expect(stats.maxReturned).toBeLessThanOrEqual(1000);
  });

  it('does not skip or repeat captions that share a timestamp, whatever the page size', async () => {
    for (const run of [1, 3, 7, 50]) {
      for (const pageSize of [1, 2, 5, 7, 8, 13]) {
        const rows = makeCaptions(60, { sameTimestampRun: run });
        const { prisma } = fakeCaptionDb(rows);
        const seen = [];
        for await (const c of eachCaption(prisma, ROOM.id, { pageSize })) seen.push(c.id);
        expect(seen).toEqual(rows.map((r) => r.id));
      }
    }
  });

  it('an empty class yields no pages, and a transcript that is an exact multiple of the page size ends cleanly', async () => {
    const empty = fakeCaptionDb([]);
    const out = []; for await (const p of pageCaptions(empty.prisma, ROOM.id)) out.push(p);
    expect(out).toEqual([]);
    const exact = fakeCaptionDb(makeCaptions(2000));
    let n = 0; for await (const p of pageCaptions(exact.prisma, ROOM.id, { pageSize: 1000 })) n += p.length;
    expect(n).toBe(2000);
  });

  it('only returns the requested class', async () => {
    const rows = [...makeCaptions(10), ...makeCaptions(10, { classroomId: 'other' })];
    const { prisma } = fakeCaptionDb(rows);
    let n = 0; for await (const p of pageCaptions(prisma, ROOM.id)) n += p.length;
    expect(n).toBe(10);
  });
});

describe('summary of long lectures', () => {
  it('a 25,000-caption lecture is read completely: every caption counted, many chunks, one final summary', async () => {
    const { prisma, stats } = fakeCaptionDb(makeCaptions(25000));
    const { chat, calls } = fakeChat();
    const r = await summarizeLecture({ classroom: ROOM, chat, pages: pagesOf(prisma), limits: { maxChunks: 400 } });
    expect(r.captionCount).toBe(25000);                 // not capped at 20,000
    expect(r.lastCaptionId).toBe(idOf(24999));
    expect(r.coverage).toBe('complete');
    expect(r.provider).toBe('groq');
    expect(calls.chunk).toBe(r.chunks);
    expect(r.chunks).toBeGreaterThan(30);
    expect(calls.final).toBe(1);
    expect(stats.maxReturned).toBeLessThanOrEqual(1000); // memory stays at one page
  });

  it('a 120,000-caption lecture is read completely (the old 100,000 limit is gone)', async () => {
    const { prisma } = fakeCaptionDb(makeCaptions(120000));
    const { chat, calls } = fakeChat();
    const limits = { chunkChars: 400000, maxChunks: 500 };
    const r = await summarizeLecture({ classroom: ROOM, chat, pages: pagesOf(prisma), limits });
    expect(r.captionCount).toBe(120000);
    expect(r.lastCaptionId).toBe(idOf(119999));
    expect(r.coverage).toBe('complete');
    expect(calls.chunk).toBeGreaterThanOrEqual(15);
  });

  it('beyond the chunk limit the rest uses an extract and the summary says it is partial (nothing is silently dropped)', async () => {
    const { prisma } = fakeCaptionDb(makeCaptions(30000));
    const { chat, calls } = fakeChat();
    const r = await summarizeLecture({ classroom: ROOM, chat, pages: pagesOf(prisma), limits: { maxChunks: 10 } });
    expect(r.captionCount).toBe(30000);
    expect(calls.chunk).toBe(10);                       // only 10 AI reads
    expect(r.chunks).toBeGreaterThan(10);               // but every chunk is accounted for
    expect(r.coverage).toBe('partial');
    expect(r.partialReason).toMatch(/longer than 10 parts/);
    expect(r.failedChunks).toBe(r.chunks - 10);
  });

  it('an empty reply for one chunk is retried, then replaced by a labelled extract: coverage becomes partial', async () => {
    const { prisma } = fakeCaptionDb(makeCaptions(8000));
    const seen = { badChunkAttempts: 0 };
    const { chat, calls } = fakeChat({ chunk: (nth, user) => { if (/Sentence number 3500 /.test(user)) { seen.badChunkAttempts += 1; return {}; } return undefined; } });
    const r = await summarizeLecture({ classroom: ROOM, chat, pages: pagesOf(prisma) });
    expect(seen.badChunkAttempts).toBe(1 + DEFAULT_LIMITS.chunkRetries); // tried again, boundedly
    expect(r.coverage).toBe('partial');
    expect(r.failedChunks).toBe(1);
    expect(r.failedRanges).toHaveLength(1);
    expect(r.partialReason).toMatch(/1 of \d+ parts could not be read by the AI/);
    expect(r.provider).toBe('groq');                     // still labelled AI-generated
    expect(calls.final).toBe(1);
  });

  it('an AI failure in the middle of processing does not abort the summary', async () => {
    const { prisma } = fakeCaptionDb(makeCaptions(12000));
    const { chat } = fakeChat({ chunk: (nth) => (nth >= 4 && nth <= 12 ? new Error('503 upstream') : undefined) });
    const r = await summarizeLecture({ classroom: ROOM, chat, pages: pagesOf(prisma), limits: { chunkRetries: 0 } });
    expect(r.captionCount).toBe(12000);
    expect(r.coverage).toBe('partial');
    expect(r.failedChunks).toBe(9);
  });

  it('when no chunk can be read the summary is a clearly labelled fallback built from the whole lecture', async () => {
    const { prisma } = fakeCaptionDb(makeCaptions(6000));
    const { chat } = fakeChat({ chunk: () => new Error('401 bad key') });
    const r = await summarizeLecture({ classroom: ROOM, chat, pages: pagesOf(prisma), limits: { chunkRetries: 0 } });
    expect(r.coverage).toBe('fallback');
    expect(r.provider).toBe('basic');
    expect(r.fallbackReason).toMatch(/could not read any part.*401 bad key/);
    expect(r.captionCount).toBe(6000);
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it('a failing final step falls back and says why (the original transcript is untouched)', async () => {
    const { prisma } = fakeCaptionDb(makeCaptions(3000));
    const { chat } = fakeChat({ final: () => ({ nonsense: true }) });
    const r = await summarizeLecture({ classroom: ROOM, chat, pages: pagesOf(prisma) });
    expect(r.coverage).toBe('fallback');
    expect(r.fallbackReason).toMatch(/not in the expected format/);
  });

  it('with no AI configured the fallback still counts every caption', async () => {
    const { prisma } = fakeCaptionDb(makeCaptions(5000));
    const r = await summarizeLecture({ classroom: ROOM, chat: null, pages: pagesOf(prisma) });
    expect(r.coverage).toBe('fallback');
    expect(r.fallbackReason).toMatch(/not configured/);
    expect(r.captionCount).toBe(5000);
  });

  it('many chunks are combined in several levels (hierarchical reduction) before the final summary', async () => {
    const { prisma } = fakeCaptionDb(makeCaptions(20000));
    const { chat, calls } = fakeChat();
    const r = await summarizeLecture({ classroom: ROOM, chat, pages: pagesOf(prisma), limits: { fanIn: 3, reduceChars: 200 } });
    expect(r.levels).toBeGreaterThanOrEqual(2);
    expect(calls.combine).toBeGreaterThan(3);
    expect(calls.final).toBe(1);
    expect(r.coverage).toBe('complete');
    const finalPrompt = chat.mock.calls[chat.mock.calls.length - 1][1];
    expect(finalPrompt.length).toBeLessThan(200 + 400); // it fits one request
  });

  it('a failed combining step keeps the strongest points and marks the summary partial', async () => {
    const { prisma } = fakeCaptionDb(makeCaptions(20000));
    const { chat } = fakeChat({ combine: (nth) => (nth === 2 ? {} : undefined) });
    const r = await summarizeLecture({ classroom: ROOM, chat, pages: pagesOf(prisma), limits: { fanIn: 3, reduceChars: 200, chunkRetries: 0 } });
    expect(r.coverage).toBe('partial');
    expect(r.partialReason).toMatch(/combining step/);
  });

  it('a time budget that runs out is reported, not hidden', async () => {
    const { prisma } = fakeCaptionDb(makeCaptions(20000));
    let t = 0;
    const { chat } = fakeChat({ chunk: () => { t += 40000; return undefined; } });
    const r = await summarizeLecture({ classroom: ROOM, chat, pages: pagesOf(prisma), limits: { budgetMs: 100000 }, now: () => t });
    expect(r.coverage).toBe('partial');
    expect(r.partialReason).toMatch(/time limit/);
    expect(r.captionCount).toBe(20000);
  });

  it('a short lecture is summarised from its transcript in a single request', async () => {
    const { prisma } = fakeCaptionDb(makeCaptions(40));
    const { chat, calls } = fakeChat();
    const r = await summarizeLecture({ classroom: ROOM, chat, pages: pagesOf(prisma) });
    expect(calls).toMatchObject({ chunk: 0, combine: 0, final: 1 });
    expect(r.chunks).toBe(1);
    expect(r.coverage).toBe('complete');
  });
});

// A model that cites exactly the transcript lines it was shown that match `re`.
const citing = (re) => (nth, user) => ({ answer: 'From the lecture.', covered: true, references: [...user.matchAll(/\[#(\d+) [^\]]+\][^\n]*/g)].filter((m) => re.test(m[0])).map((m) => Number(m[1])) });

describe('question answering over a long lecture', () => {
  const plant = { 1: 'Mitochondria produce most of the cell energy.', 60000: 'Remember that mitochondria have their own DNA.', 119999: 'Final point: mitochondria are inherited from the mother.' };
  const setup = () => { const { prisma, stats } = fakeCaptionDb(makeCaptions(120000, { plant })); return { prisma, stats, source: prismaSource(prisma, ROOM.id) }; };

  it('finds matches anywhere in a 120,000-caption lecture, with real timestamped references', async () => {
    const { prisma, source, stats } = setup();
    const { chat } = fakeChat({ ask: citing(/mitochondria/i) });
    const r = await askLecture({ classroom: ROOM, source, question: 'What do mitochondria do?', chat });
    expect(r.covered).toBe(true);
    expect(r.coverage).toMatchObject({ mode: 'searched', totalCaptions: 120000, matches: 3, complete: true });
    expect(r.coverage.note).toMatch(/Searched all 120000 captions/);
    // 99 does not exist, so it is dropped; the others point at the real planted captions
    expect(r.references).toHaveLength(3);
    const real = new Map(makeCaptions(120000, { plant }).map((c) => [c.id, c]));
    r.references.forEach((ref) => {
      expect(real.has(ref.id)).toBe(true);
      expect(ref.text).toBe(real.get(ref.id).text);
      expect(ref.at).toMatch(/^\d+:\d\d(:\d\d)?$/);
    });
    expect(r.references.some((ref) => ref.id === idOf(119999))).toBe(true); // the last caption is searchable
    expect(stats.maxReturned).toBeLessThanOrEqual(2000);                   // bounded pages
    void prisma;
  });

  it('timestamps are offsets from the first caption of THIS lecture', async () => {
    const { source } = setup();
    const { chat } = fakeChat({ ask: citing(/mitochondria/i) });
    const r = await askLecture({ classroom: ROOM, source, question: 'mitochondria', chat });
    const last = r.references.find((x) => x.id === idOf(119999));
    // caption 119999 starts floor(119999/7) seconds after the first one
    expect(last.at).toBe(clock(Math.floor(119999 / 7) * 1000));
  });

  it('says "not covered" when the lecture never mentions the topic, without calling the AI', async () => {
    const { source } = setup();
    const { chat } = fakeChat();
    const r = await askLecture({ classroom: ROOM, source, question: 'Explain photosynthesis and chlorophyll', chat });
    expect(chat).not.toHaveBeenCalled();
    expect(r.covered).toBe(false);
    expect(r.references).toEqual([]);
    expect(r.coverage.complete).toBe(true);
  });

  it('never invents references: numbers the model makes up or repeats are dropped', async () => {
    const { source } = setup();
    const { chat } = fakeChat({ ask: () => ({ answer: 'Because.', references: [0, -1, 5000, 'abc', 1], covered: true }) });
    const r = await askLecture({ classroom: ROOM, source, question: 'mitochondria energy', chat });
    expect(r.references).toHaveLength(1);
    expect(r.references[0].n).toBe(1);
  });

  it('flags extra explanation that is not from the lecture', async () => {
    const { source } = setup();
    const { chat } = fakeChat({ ask: () => ({ answer: 'It is the powerhouse. Extra explanation (not from the lecture): they have two membranes.', references: [1], covered: true }) });
    const r = await askLecture({ classroom: ROOM, source, question: 'mitochondria', chat });
    expect(r.extraExplanation).toBe(true);
  });

  it('a general question is answered from sampled moments and the answer says so (it never claims the whole transcript was searched)', async () => {
    const { source } = setup();
    const { chat } = fakeChat({ ask: () => ({ answer: 'The lecture is about forces.', references: [1], covered: true }) });
    const r = await askLecture({ classroom: ROOM, source, question: 'What is this lecture about?', chat });
    expect(r.coverage.mode).toBe('sampled');
    expect(r.coverage.note).toMatch(/not the whole transcript/);
    expect(r.coverage.complete).toBe(true);
  });

  it('without AI a general question gets an honest message, and a keyword question gets real matching moments', async () => {
    const { source } = setup();
    const general = await askLecture({ classroom: ROOM, source, question: 'What is this lecture about?', chat: null });
    expect(general.provider).toBe('search');
    expect(general.references).toEqual([]);
    expect(general.answer).toMatch(/specific word or topic/);
    const keyed = await askLecture({ classroom: ROOM, source, question: 'mitochondria', chat: null });
    expect(keyed.provider).toBe('search');
    expect(keyed.references.length).toBeGreaterThanOrEqual(3);
    expect(keyed.references.every((r) => /mitochondria/i.test(r.text))).toBe(true);
  });

  it('when more captions match than the scan limit allows, the answer says the search was not complete', async () => {
    const rows = makeCaptions(5000); // every caption mentions "forces"
    const { prisma } = fakeCaptionDb(rows);
    const { chat } = fakeChat();
    const r = await askLecture({ classroom: ROOM, source: prismaSource(prisma, ROOM.id), question: 'tell me about forces', chat, limits: { maxScan: 2000 } });
    expect(r.coverage.complete).toBe(false);
    expect(r.coverage.note).toMatch(/some matches were not examined/);
  });

  it('the best-scoring captions win even when thousands of captions match', async () => {
    const rows = makeCaptions(6000, { plant: { 4321: 'The conservation of momentum matters when forces act in collisions.' } });
    const { prisma } = fakeCaptionDb(rows);
    const { chat } = fakeChat({ ask: () => ({ answer: 'ok', references: [1, 2, 3], covered: true }) });
    const r = await askLecture({ classroom: ROOM, source: prismaSource(prisma, ROOM.id), question: 'conservation of momentum in collisions', chat });
    expect(r.references.map((x) => x.id)).toContain(idOf(4321));
  });
});

describe('complete exports', () => {
  const collect = async (kind, rows, pageSize = 1000) => {
    const { prisma } = fakeCaptionDb(rows);
    const parts = [];
    const res = await streamTranscript({ prisma, classroom: ROOM, kind, pageSize, write: async (c) => { parts.push(c); } });
    return { text: parts.join(''), res };
  };

  it('TXT, SRT and HTML streams equal the whole-string versions byte for byte', async () => {
    const rows = makeCaptions(2500);
    expect((await collect('txt', rows)).text).toBe(toTxt(ROOM, rows));
    expect((await collect('srt', rows)).text).toBe(toSrt(rows));
    expect((await collect('html', rows)).text).toBe(toPrintHtml(ROOM, rows, null));
  });

  it('a 25,000-caption transcript is exported in full (no 20,000 cut-off), every caption exactly once', async () => {
    const rows = makeCaptions(25000);
    const { text, res } = await collect('txt', rows);
    expect(res.captions).toBe(25000);
    const lines = text.trim().split('\n').filter((l) => /^\[\d/.test(l));
    expect(lines).toHaveLength(25000);
    expect(lines[0]).toMatch(/Sentence number 0 /);
    expect(lines[24999]).toMatch(/Sentence number 24999 /);
    expect(new Set(lines).size).toBe(lines.length);
    expect(text).toMatch(/Captions: 25000/);
  });

  it('a 120,000-caption SRT has 120,000 numbered cues in order', async () => {
    const { text } = await collect('srt', makeCaptions(120000), 2000);
    const cues = text.trim().split('\n\n');
    expect(cues).toHaveLength(120000);
    expect(cues[0].startsWith('1\n')).toBe(true);
    expect(cues[119999].startsWith('120000\n')).toBe(true);
  });

  it('an interrupted export fails loudly after writing only part of the file (so it cannot pass for a complete one)', async () => {
    const rows = makeCaptions(5000);
    const { prisma } = fakeCaptionDb(rows);
    const real = prisma.caption.findMany;
    let calls = 0;
    prisma.caption.findMany = async (args) => { calls += 1; if (calls === 3) throw new Error('database connection lost'); return real(args); };
    const parts = [];
    await expect(streamTranscript({ prisma, classroom: ROOM, kind: 'txt', pageSize: 1000, write: async (c) => { parts.push(c); } })).rejects.toThrow('database connection lost');
    const written = parts.join('').split('\n').filter((l) => /^\[\d/.test(l)).length;
    expect(written).toBe(2000); // two full pages were sent before the failure; the caller then aborts the connection
  });

  it('an empty class produces a valid empty export', async () => {
    const { text, res } = await collect('srt', []);
    expect(text).toBe('');
    expect(res.captions).toBe(0);
    expect((await collect('txt', [])).text).toMatch(/Captions: 0/);
  });
});
