// tests/core.test.js
// Pure-logic tests: permissions, presence counting, lecture AI (chunking / validation / fallbacks), exports, env validation, log redaction.
'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-access-secret-test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-test-refresh-secret';

const { can, permissionsFor, matrix, effectiveRole } = require('../src/config/permissions');
const { PresenceRegistry } = require('../src/sockets/presenceRegistry');
const lectureAi = require('../src/utils/lectureAi');
const { toTxt, toSrt, toPrintHtml, srtTime, clock } = require('../src/utils/transcriptExport');
const { validateEnv } = require('../src/config/env');
const logger = require('../src/utils/logger');
const { profileStats } = require('../src/utils/stats');

const mkCaptions = (n, start = Date.UTC(2026, 10, 14, 9, 0, 0)) => Array.from({ length: n }, (_, i) => ({
  id: `c${i + 1}`, speakerName: i % 2 ? 'Asha' : 'Teacher', source: 'SPEECH',
  text: `Sentence number ${i + 1} about forces and motion in physics class.`, createdAt: new Date(start + i * 5000),
}));

describe('permissions (role-based access)', () => {
  it('students can join and read but not teach or administer', () => {
    const s = { role: 'USER' };
    expect(can(s, 'class.join')).toBe(true);
    expect(can(s, 'captions.read')).toBe(true);
    expect(can(s, 'lecture.ask')).toBe(true);
    ['class.create', 'notes.generate', 'analytics.class', 'admin.panel', 'users.manage', 'audit.view'].forEach((p) => expect(can(s, p)).toBe(false));
  });
  it('teachers can run classes but not administer the site', () => {
    const t = { role: 'TEACHER' };
    ['class.create', 'notes.generate', 'analytics.class', 'captions.edit'].forEach((p) => expect(can(t, p)).toBe(true));
    ['admin.panel', 'users.manage', 'audit.view', 'languages.manage'].forEach((p) => expect(can(t, p)).toBe(false));
  });
  it('admins can do everything listed', () => {
    Object.keys(require('../src/config/permissions').PERMISSIONS).forEach((p) => expect(can({ role: 'ADMIN' }, p)).toBe(true));
  });
  it('unknown permissions and missing users are denied; the legacy MODERATOR role has no extra power', () => {
    expect(can({ role: 'ADMIN' }, 'made.up')).toBe(false);
    expect(can(null, 'class.join')).toBe(false);
    expect(effectiveRole('MODERATOR')).toBe('USER');
    expect(can({ role: 'MODERATOR' }, 'class.create')).toBe(false);
  });
  it('lists permissions per role, and the matrix is consistent with can()', () => {
    expect(permissionsFor('USER')).not.toContain('class.create');
    matrix().forEach((row) => {
      expect(row.USER).toBe(can({ role: 'USER' }, row.key));
      expect(row.TEACHER).toBe(can({ role: 'TEACHER' }, row.key));
      expect(row.ADMIN).toBe(can({ role: 'ADMIN' }, row.key));
    });
  });
});

describe('PresenceRegistry (attendance across devices)', () => {
  let t; let reg;
  beforeEach(() => { t = 1000000; reg = new PresenceRegistry(() => t); });

  it('counts a person once, however many devices they use', () => {
    expect(reg.join('c1', { id: 'u1', username: 'asha' }, 's1').first).toBe(true);
    expect(reg.join('c1', { id: 'u1', username: 'asha' }, 's2').first).toBe(false);
    reg.join('c1', { id: 'u2', username: 'ben' }, 's3');
    expect(reg.count('c1')).toBe(2);
    expect(reg.users('c1').map((u) => u.userId).sort()).toEqual(['u1', 'u2']);
  });
  it('only reports "last" and the time online when the final device leaves', () => {
    reg.join('c1', { id: 'u1', username: 'a' }, 's1');
    reg.join('c1', { id: 'u1', username: 'a' }, 's2');
    t += 30000;
    expect(reg.leave('c1', 'u1', 's1')).toEqual({ last: false, seconds: 0 });
    t += 30000;
    expect(reg.leave('c1', 'u1', 's2')).toEqual({ last: true, seconds: 60 });
    expect(reg.count('c1')).toBe(0);
  });
  it('flush counts elapsed time once, so it is never double counted on leave', () => {
    reg.join('c1', { id: 'u1', username: 'a' }, 's1');
    t += 60000;
    expect(reg.flush('c1')).toEqual([{ userId: 'u1', seconds: 60 }]);
    t += 20000;
    expect(reg.leave('c1', 'u1', 's1')).toEqual({ last: true, seconds: 20 });
  });
  it('ignores unknown leaves, and end() returns everyone (even with 0 seconds) then forgets the class', () => {
    expect(reg.leave('nope', 'u1', 's1')).toEqual({ last: false, seconds: 0 });
    reg.join('c1', { id: 'u1', username: 'a' }, 's1');
    reg.join('c1', { id: 'u2', username: 'b' }, 's2');
    expect(reg.end('c1').map((x) => x.userId).sort()).toEqual(['u1', 'u2']);
    expect(reg.count('c1')).toBe(0);
    expect(reg.activeClassIds()).toEqual([]);
  });
  it('finds the classes a socket is in (used on disconnect)', () => {
    reg.join('c1', { id: 'u1', username: 'a' }, 's1');
    reg.join('c2', { id: 'u1', username: 'a' }, 's1');
    expect(reg.classesOfSocket('s1', 'u1').sort()).toEqual(['c1', 'c2']);
  });
});

describe('lecture AI', () => {
  it('chunking keeps every caption exactly once, in order', () => {
    const caps = mkCaptions(200);
    const chunks = lectureAi.chunkCaptions(caps, 2000);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.flat().map((c) => c.n)).toEqual(caps.map((_, i) => i + 1));
    chunks.forEach((ch) => expect(ch.reduce((n, c) => n + c.line.length, 0)).toBeLessThan(2200));
  });

  it('summarises a short lecture with one request and validates the result', async () => {
    const chat = jest.fn().mockResolvedValue({
      notes: ['Force causes acceleration', 'Mass resists acceleration'], keyTerms: [{ term: 'Force', definition: 'a push or pull' }],
      takeaways: ['F = ma'], revision: ['Define force'],
      quiz: [{ question: 'What is F?', options: ['a', 'b', 'c', 'd'], answerIndex: 1, explanation: 'Because.' }, { question: 'bad', options: ['a'], answerIndex: 9 }],
    });
    const r = await lectureAi.summarizeLecture({ classroom: { title: 'Physics', keywords: [] }, captions: mkCaptions(6), chat });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(r.provider).toBe('groq');
    expect(r.quiz).toHaveLength(1);
    expect(r.quiz[0].explanation).toBe('Because.');
    expect(r.captionCount).toBe(6);
    expect(r.lastCaptionId).toBe('c6');
  });

  it('reads the WHOLE of a long lecture: one request per chunk, then a final combine', async () => {
    const chat = jest.fn().mockImplementation(async (system) => (/one part/.test(system)
      ? { points: ['a point from this part'], terms: [] }
      : { notes: ['combined note'], keyTerms: [], takeaways: [], revision: [], quiz: [] }));
    const caps = mkCaptions(300);
    const r = await lectureAi.summarizeLecture({ classroom: { title: 'Long', keywords: [] }, captions: caps, chat, maxChunkChars: 3000 });
    const chunkCalls = lectureAi.chunkCaptions(caps, 3000).length;
    expect(chunkCalls).toBeGreaterThan(3);
    expect(chat).toHaveBeenCalledTimes(chunkCalls + 1);
    expect(r.chunks).toBe(chunkCalls);
    const finalPrompt = chat.mock.calls[chat.mock.calls.length - 1][1];
    expect((finalPrompt.match(/Part \d+/g) || []).length).toBe(chunkCalls);
  });

  it('falls back to a labelled basic summary when AI is missing, fails, or returns junk', async () => {
    const caps = mkCaptions(8);
    const none = await lectureAi.summarizeLecture({ classroom: { title: 'x' }, captions: caps, chat: null });
    expect(none.provider).toBe('basic');
    expect(none.fallbackReason).toMatch(/not configured/);
    expect(none.notes.length).toBeGreaterThan(0);
    const thrown = await lectureAi.summarizeLecture({ classroom: { title: 'x' }, captions: caps, chat: jest.fn().mockRejectedValue(new Error('429')) });
    expect(thrown.provider).toBe('basic');
    expect(thrown.fallbackReason).toMatch(/429/);
    const junk = await lectureAi.summarizeLecture({ classroom: { title: 'x' }, captions: caps, chat: jest.fn().mockResolvedValue({ nonsense: true }) });
    expect(junk.provider).toBe('basic');
    expect(junk.fallbackReason).toMatch(/format/);
  });

  it('validateSummary rejects empty or malformed model output', () => {
    expect(lectureAi.validateSummary(null)).toBeNull();
    expect(lectureAi.validateSummary({ notes: [] })).toBeNull();
    expect(lectureAi.validateSummary({ notes: ['ok'], quiz: 'nope' }).quiz).toEqual([]);
  });

  it('answers only from the transcript: references are checked against the lines that were sent', async () => {
    const caps = mkCaptions(30);
    caps[11].text = 'Momentum is mass times velocity and it is conserved in collisions.';
    const chat = jest.fn().mockResolvedValue({ answer: 'Momentum is mass times velocity.', references: [12, 9999], covered: true });
    const r = await lectureAi.askLecture({ classroom: { title: 'P' }, captions: caps, notes: null, question: 'What is momentum?', chat });
    expect(r.covered).toBe(true);
    expect(r.references.map((x) => x.n)).toEqual([12]);
    expect(r.references[0].at).toMatch(/^\d\d:\d\d$/);
    const sent = chat.mock.calls[0][1];
    expect(sent).toMatch(/#12 /);
    expect(sent).toMatch(/Question: What is momentum\?/);
  });
  it('says the lecture did not cover it when nothing matches, without calling the AI', async () => {
    const chat = jest.fn();
    const r = await lectureAi.askLecture({ classroom: { title: 'P' }, captions: mkCaptions(10), notes: null, question: 'Explain chloroplast thylakoids', chat });
    expect(chat).not.toHaveBeenCalled();
    expect(r.covered).toBe(false);
    expect(r.references).toEqual([]);
  });
  it('falls back to timestamped search results when the AI is down', async () => {
    const caps = mkCaptions(20);
    caps[4].text = 'Friction opposes motion between surfaces.';
    const r = await lectureAi.askLecture({ classroom: { title: 'P' }, captions: caps, notes: null, question: 'what is friction', chat: jest.fn().mockRejectedValue(new Error('down')) });
    expect(r.provider).toBe('search');
    expect(r.references[0].text).toMatch(/Friction/);
  });
});

describe('transcript exports', () => {
  const room = { title: 'Physics <1>', code: 'ABC234', createdAt: new Date(Date.UTC(2026, 10, 14)) };
  it('formats SRT times', () => {
    expect(srtTime(0)).toBe('00:00:00,000');
    expect(srtTime(3725400)).toBe('01:02:05,400');
    expect(clock(65000)).toBe('01:05');
    expect(clock(3725000)).toBe('1:02:05');
  });
  it('SRT numbers cues, never overlaps them, and ends after it starts', () => {
    const srt = toSrt(mkCaptions(4));
    const cues = srt.trim().split('\n\n');
    expect(cues).toHaveLength(4);
    let prevEnd = -1;
    cues.forEach((cue, i) => {
      const [num, times] = cue.split('\n');
      expect(num).toBe(String(i + 1));
      const m = times.match(/(\d+):(\d+):(\d+),(\d+) --> (\d+):(\d+):(\d+),(\d+)/);
      const ms = (h, mi, s, x) => ((+h * 60 + +mi) * 60 + +s) * 1000 + +x;
      const start = ms(m[1], m[2], m[3], m[4]); const end = ms(m[5], m[6], m[7], m[8]);
      expect(end).toBeGreaterThan(start);
      expect(start).toBeGreaterThanOrEqual(prevEnd);
      prevEnd = end;
    });
  });
  it('TXT lists every caption with an offset, speaker and source', () => {
    const txt = toTxt(room, mkCaptions(3));
    expect(txt).toMatch(/Class code: ABC234/);
    expect(txt.split('\n').filter((l) => /^\[\d\d:\d\d\]/.test(l))).toHaveLength(3);
  });
  it('printable HTML escapes content and contains no script', () => {
    const caps = mkCaptions(2); caps[0].text = '<img src=x onerror=alert(1)> & more';
    const html = toPrintHtml(room, caps, { notes: ['<b>note</b>'] });
    expect(html).not.toMatch(/<img/);
    expect(html).toMatch(/&lt;img/);
    expect(html).toMatch(/&lt;b&gt;note/);
    expect(html).not.toMatch(/<script/i);
    expect(html).toMatch(/Physics &lt;1&gt;/);
  });
});

describe('environment validation', () => {
  const quiet = { warn: () => {} };
  it('requires the secrets in production and says which are missing', () => {
    expect(() => validateEnv({ NODE_ENV: 'production', JWT_SECRET: 'x' }, quiet)).toThrow(/MONGODB_URI.*DATABASE_URL.*JWT_REFRESH_SECRET.*SESSION_SECRET.*FRONTEND_URL/s);
  });
  it('accepts a complete production environment and warns about optional services', () => {
    const warnings = [];
    const env = { NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40), SESSION_SECRET: 'c'.repeat(40), MONGODB_URI: 'm', DATABASE_URL: 'p', FRONTEND_URL: 'https://x.example' };
    validateEnv(env, { warn: (w) => warnings.push(w) });
    expect(warnings.join(' ')).toMatch(/GROQ_API_KEY/);
    expect(warnings.join(' ')).toMatch(/BREVO_API_KEY/);
  });
  it('is relaxed outside production', () => {
    expect(() => validateEnv({ NODE_ENV: 'development', JWT_SECRET: 'x' }, quiet)).not.toThrow();
  });
});

describe('practice statistics (PostgreSQL is the source of truth)', () => {
  it('are derived from the rows, with stable rounding', () => {
    expect(profileStats({ count: 3, avgAccuracy: 81.666666, sumDuration: 590 })).toEqual({ totalSessions: 3, totalMinutes: 10, avgAccuracy: 81.67 });
  });
  it('are zero with no sessions, so recomputing is always safe', () => {
    expect(profileStats({ count: 0, avgAccuracy: null, sumDuration: null })).toEqual({ totalSessions: 0, totalMinutes: 0, avgAccuracy: 0 });
    expect(profileStats()).toEqual({ totalSessions: 0, totalMinutes: 0, avgAccuracy: 0 });
  });
  it('give the same answer however many times they are recomputed', () => {
    const agg = { count: 5, avgAccuracy: 72.5, sumDuration: 1234 };
    expect(profileStats(agg)).toEqual(profileStats(agg));
  });
});

describe('log redaction', () => {
  it('removes tokens, passwords, codes and connection-string passwords', () => {
    const out = logger.redact('Bearer abc.def.ghi password=hunter2 otp: 123456 mongodb+srv://u:secretpw@h/db eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.sigsigsigsig ok');
    expect(out).not.toMatch(/hunter2|123456|secretpw|abc\.def|sigsig/);
    expect(out).toMatch(/ok$/);
  });
});
