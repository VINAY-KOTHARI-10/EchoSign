'use strict';
// Voice analysis: word alignment, timing, and the scores built from measurements. All pure functions, no network.
const v = require('../src/utils/voiceAnalysis');

const at = (list) => list.map(([word, start, end]) => ({ word, start, end }));

describe('alignWords', () => {
  test('a perfect repeat scores 100 and every word is correct', () => {
    const a = v.alignWords('Hello, how are you today?', 'hello how are you today');
    expect(a.accuracy).toBe(100);
    expect(a.words.every((w) => w.status === 'correct')).toBe(true);
    expect(a.extra).toEqual([]);
  });

  test('a missing word is reported as missed, not guessed', () => {
    const a = v.alignWords('I would like some water', 'I would like water');
    const missed = a.words.find((w) => w.word === 'some');
    expect(missed.status).toBe('missed');
    expect(missed.score).toBe(0);
    expect(a.accuracy).toBeLessThan(100);
  });

  test('a near miss is "close" and names what was heard', () => {
    const a = v.alignWords('The weather is lovely', 'The wether is lovely');
    const w = a.words.find((x) => x.word === 'weather');
    expect(w.status).toBe('close');
    expect(w.heard).toBe('wether');
    expect(w.note).toContain('wether');
  });

  test('a different word is incorrect, extra words are listed', () => {
    const a = v.alignWords('Open the window', 'Open the door now');
    expect(a.words.find((w) => w.word === 'window').status).toBe('incorrect');
    expect(a.words.find((w) => w.word === 'window').heard).toBe('door');
    expect(a.extra).toContain('now');
  });

  test('nothing heard means every word is missed', () => {
    const a = v.alignWords('Good morning', '');
    expect(a.accuracy).toBe(0);
    expect(a.words.map((w) => w.status)).toEqual(['missed', 'missed']);
  });

  test('text without spaces (Japanese) is compared character by character', () => {
    const a = v.alignWords('おはよう', 'おはよう');
    expect(a.accuracy).toBe(100);
    expect(a.words.length).toBe(4);
  });
});

describe('timingMetrics', () => {
  const steady = at([['one', 0.2, 0.5], ['two', 0.6, 0.9], ['three', 1.0, 1.3], ['four', 1.4, 1.7], ['five', 1.8, 2.1]]);

  test('needs at least two timed words', () => {
    expect(v.timingMetrics([], 'en')).toBeNull();
    expect(v.timingMetrics(at([['hi', 0, 0.2]]), 'en')).toBeNull();
  });

  test('speed in words per minute and a pace label', () => {
    const t = v.timingMetrics(steady, 'en');
    expect(t.wordCount).toBe(5);
    expect(t.wordsPerMinute).toBe(Math.round((5 / 1.9) * 60)); // 158
    expect(t.pace).toBe('natural');
    expect(t.pauseCount).toBe(0);
  });

  test('pauses and hesitations are counted from the gaps between words', () => {
    const t = v.timingMetrics(at([['I', 0, 0.2], ['would', 0.3, 0.5], ['like', 1.7, 1.9], ['water', 2.0, 2.4]]), 'en');
    expect(t.pauseCount).toBe(1);
    expect(t.longPauseCount).toBe(1);
    expect(t.longestPause).toBe(1.2);
  });

  test('languages written without spaces get no words-per-minute figure', () => {
    const t = v.timingMetrics(steady, 'ja');
    expect(t.wordsPerMinute).toBeNull();
    expect(t.pace).toBeNull();
  });
});

describe('scores', () => {
  test('fluency falls with hesitations and with a very slow pace', () => {
    const smooth = v.fluencyScore({ wordCount: 6, longPauseCount: 0, pauseRatio: 0, startDelay: 0.3, wordsPerMinute: 130 });
    const hesitant = v.fluencyScore({ wordCount: 6, longPauseCount: 3, pauseRatio: 0.4, startDelay: 2, wordsPerMinute: 40 });
    expect(smooth).toBe(100);
    expect(hesitant).toBeLessThan(smooth - 30);
    expect(v.fluencyScore({ wordCount: 2, longPauseCount: 0, pauseRatio: 0, startDelay: 0, wordsPerMinute: 100 })).toBeNull();
  });

  test('intonation: flat is penalised, a lively spread is not, too little audio gives no score', () => {
    const base = { voicedFrames: 100, pitchStdSemitones: 3.5 };
    expect(v.intonationScore(base)).toBe(100);
    expect(v.intonationScore({ ...base, pitchStdSemitones: 0.3 })).toBeLessThan(70);
    expect(v.intonationScore({ ...base, voicedFrames: 5 })).toBeNull();
    expect(v.intonationScore(null)).toBeNull();
  });

  test('stress follows the loudness spread the same way', () => {
    expect(v.stressScore({ voicedFrames: 100, loudnessStdDb: 5 })).toBe(100);
    expect(v.stressScore({ voicedFrames: 100, loudnessStdDb: 0.5 })).toBeLessThan(60);
  });

  test('clarity is the average word probability of the segments', () => {
    expect(v.clarityScore([{ avg_logprob: 0 }])).toBe(100);
    expect(v.clarityScore([{ avg_logprob: Math.log(0.5) }])).toBe(50);
    expect(v.clarityScore([])).toBeNull();
  });
});

describe('cleanClientMetrics', () => {
  test('keeps real numbers, clamps wild ones, drops junk', () => {
    const c = v.cleanClientMetrics({ pitchStdSemitones: 999, voicedRatio: 0.6, loudnessStdDb: 'abc', durationSec: 4.2 });
    expect(c.pitchStdSemitones).toBe(24);
    expect(c.voicedRatio).toBe(0.6);
    expect(c.durationSec).toBe(4.2);
    expect(v.cleanClientMetrics('nope')).toBeNull();
    expect(v.cleanClientMetrics({})).toBeNull();
  });
});

describe('measuredAdvice', () => {
  test('tips name the words and the measurements, never invented facts', () => {
    const align = v.alignWords('open the window please', 'open the door please');
    const tips = v.measuredAdvice({ timing: { longPauseCount: 2, pace: 'slow', wordsPerMinute: 55 }, client: { pitchStdSemitones: 0.8 }, clarity: 50, align });
    const text = tips.join(' ');
    expect(text).toContain('window');
    expect(tips.length).toBeLessThanOrEqual(4);
  });
});
