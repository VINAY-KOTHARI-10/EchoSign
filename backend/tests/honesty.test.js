'use strict';
// Things the app must never pretend: invented scores, a class that is open before its start time, languages that
// ignore what an admin set. These tests pin the honest behaviour.
const fs = require('fs');
const path = require('path');
const { basicComparison } = require('../src/controllers/speechController');
const { startsInFuture, mustWait } = require('../src/utils/classTiming');
const { LANGUAGES, effectiveLanguages, makeResolver } = require('../src/config/languages');

const src = (rel) => fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf8');

describe('pronunciation fallback (no AI available)', () => {
  it('compares words only: no invented fluency, intonation, stress or sounds', () => {
    const r = basicComparison('The weather is nice today', 'the weather is nice');
    expect(r.ai).toBe(false);
    expect(r.provider).toBe('basic');
    expect(r.fluencyScore).toBeNull();
    expect(r.intonationScore).toBeNull();
    expect(r.stressScore).toBeNull();
    expect(r.phonemeAnalysis).toEqual([]);
    expect(r.overallAccuracy).toBe(80); // 4 of 5 words heard
    expect(r.wordsBreakdown.map((w) => w.status)).toEqual(['correct', 'correct', 'correct', 'correct', 'missed']);
  });

  it('gives the same answer every time (nothing is random)', () => {
    const a = basicComparison('Good morning everyone', 'good evening everyone');
    const b = basicComparison('Good morning everyone', 'good evening everyone');
    expect(a).toEqual(b);
  });

  it('ignores case and punctuation, counts repeated words once each, and handles silence', () => {
    expect(basicComparison('Hello, world!', 'HELLO WORLD').overallAccuracy).toBe(100);
    expect(basicComparison('go go stop', 'go stop').overallAccuracy).toBe(67); // the second "go" was not heard
    expect(basicComparison('Hello world', '').overallAccuracy).toBe(0);
    expect(basicComparison('', 'anything').overallAccuracy).toBe(0);
  });

  it('says plainly that it is not an AI assessment', () => {
    expect(basicComparison('Hello', 'hello').suggestions.join(' ')).toMatch(/unavailable/i);
  });

  it('the controller has no random scores left, and stores only real AI analyses', () => {
    const speech = src('controllers/speechController.js');
    expect(speech).not.toMatch(/Math\.random/);
    expect(speech).not.toMatch(/generateMockAnalysis/);
    expect(speech).toMatch(/groqAnalysis\.ai === false \? null/);
  });

  it('the AI Partner never answers with a canned reply or a random score', () => {
    const routes = src('routes/v1/conversationRoutes.js');
    expect(routes).not.toMatch(/Math\.random/);
    expect(routes).not.toMatch(/getDemoReply/);
    expect(routes).toMatch(/AI_UNAVAILABLE/);
  });
});

describe('scheduled classes', () => {
  const now = new Date('2026-03-01T10:00:00Z');
  const future = new Date('2026-03-01T12:00:00Z');
  const past = new Date('2026-03-01T09:00:00Z');

  it('a future start time is "not started"; a past, missing or invalid one is not', () => {
    expect(startsInFuture({ scheduledAt: future }, now)).toBe(true);
    expect(startsInFuture({ scheduledAt: past }, now)).toBe(false);
    expect(startsInFuture({ scheduledAt: null }, now)).toBe(false);
    expect(startsInFuture({ scheduledAt: 'not a date' }, now)).toBe(false);
    expect(startsInFuture(null, now)).toBe(false);
  });

  it('students and captioners wait; the host and admins (who act as host) do not', () => {
    const c = { scheduledAt: future };
    expect(mustWait(c, 'STUDENT', now)).toBe(true);
    expect(mustWait(c, 'CAPTIONER', now)).toBe(true);
    expect(mustWait(c, 'HOST', now)).toBe(false);
    expect(mustWait({ scheduledAt: past }, 'STUDENT', now)).toBe(false);
  });

  it('both the socket join and the HTTP caption path use it', () => {
    expect(src('sockets/socketManager.js')).toMatch(/mustWait\(classroom, classRoleFor\(classroom, user\)\)/);
    expect(src('controllers/classroomController.js')).toMatch(/mustWait\(classroom, classRoleFor\(classroom, req\.user\)\)/);
  });
});

describe('languages follow the admin page', () => {
  const codes = (list) => list.map((l) => l.code);

  it('with nothing set by an admin, the built-in languages apply', () => {
    expect(codes(effectiveLanguages([]))).toEqual(LANGUAGES.map((l) => l.code));
  });

  it('a language an admin adds appears, and keeps the built-in ones', () => {
    const list = effectiveLanguages([{ code: 'tr', name: 'Turkish', flag: 'TR', active: true }]);
    expect(codes(list)).toContain('tr');
    expect(codes(list)).toContain('en');
    expect(list.length).toBe(LANGUAGES.length + 1);
  });

  it('switching a language off removes it, built-in or added', () => {
    const list = effectiveLanguages([{ code: 'fr', name: 'French', flag: '', active: false }, { code: 'tr', name: 'Turkish', flag: '', active: false }]);
    expect(codes(list)).not.toContain('fr');
    expect(codes(list)).not.toContain('tr');
  });

  it('an admin can rename a built-in language', () => {
    const list = effectiveLanguages([{ code: 'zh', name: 'Chinese', flag: '', active: true }]);
    expect(list.find((l) => l.code === 'zh').name).toBe('Chinese');
  });

  it('the resolver accepts names and codes of the list in effect, and refuses others', () => {
    const resolve = makeResolver(effectiveLanguages([{ code: 'tr', name: 'Turkish', flag: '', active: true }]));
    expect(resolve('turkish')).toBe('Turkish');
    expect(resolve('TR')).toBe('Turkish');
    expect(resolve('Klingon')).toBeNull();
    expect(resolve('')).toBeNull();
  });
});
