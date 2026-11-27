// src/utils/voiceAnalysis.js
// Analysis of a recorded voice clip. Everything here is measured from the audio or computed from the measurements:
//   * transcribeAudio  – Groq Whisper turns the clip into words with start and end times (not the browser's guess)
//   * alignWords       – the phrase the learner should say against what Whisper heard, word by word
//   * timingMetrics    – speed, pauses and hesitation from the word times
//   * voiceScores      – fluency, intonation and stress estimates from those measurements and from the pitch / loudness
//                        the browser measured while recording (see frontend lib/voiceMetrics.js)
// The scoring formulas are plain and documented below. They are estimates of how the voice behaved, not a phoneme-level
// pronunciation model, and the app says so.
'use strict';

const logger = require('./logger');

const WHISPER_MODEL = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo';
const CJK = /[぀-ヿ㐀-鿿가-힯]/;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round = (n) => Math.round(n);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

// ── words ──────────────────────────────────────────────────────────────────
const normalise = (w) => String(w || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}']/gu, '');

// Languages written without spaces (Japanese, Chinese, Korean text) are compared character by character.
const tokens = (text) => {
  const t = String(text || '').trim();
  if (!t) return [];
  if (CJK.test(t) && !/\s/.test(t)) return [...t].filter((c) => normalise(c));
  return t.split(/\s+/).filter((w) => normalise(w));
};

const editDistance = (a, b) => {
  const m = a.length; const n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
};

const similarity = (a, b) => {
  const x = normalise(a); const y = normalise(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - editDistance(x, y) / Math.max(x.length, y.length);
};

// Punctuation is not part of how a word is said, so it is not shown next to the word.
const bare = (w) => String(w || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

const statusFor = (score) => (score >= 90 ? 'correct' : score >= 60 ? 'close' : 'incorrect');

/**
 * Align the target phrase with what was heard (minimum edit alignment over words, where a near-match costs less than a
 * miss). Returns one entry per target word plus any extra words that were heard, and the mean word score.
 */
function alignWords(targetText, heardText) {
  const T = tokens(targetText); const H = tokens(heardText);
  const n = T.length; const m = H.length;
  const cost = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const back = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(''));
  for (let i = 1; i <= n; i++) { cost[i][0] = i; back[i][0] = 'del'; }
  for (let j = 1; j <= m; j++) { cost[0][j] = j; back[0][j] = 'ins'; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sim = similarity(T[i - 1], H[j - 1]);
      // two words that are not alike are just a different word: a flat cost, so the pairing follows the order they were said in
      const sub = cost[i - 1][j - 1] + (sim >= 0.6 ? 1 - sim : 0.9);
      const del = cost[i - 1][j] + 1;
      const ins = cost[i][j - 1] + 1;
      const best = Math.min(sub, del, ins);
      cost[i][j] = best;
      back[i][j] = best === ins ? 'ins' : best === del ? 'del' : 'sub';
    }
  }
  const words = new Array(n); const extra = [];
  let i = n; let j = m;
  while (i > 0 || j > 0) {
    const step = back[i][j];
    if (step === 'sub') {
      const sim = similarity(T[i - 1], H[j - 1]);
      const score = round(sim * 100);
      words[i - 1] = { word: bare(T[i - 1]), heard: bare(H[j - 1]), score, status: statusFor(score), note: null };
      i--; j--;
    } else if (step === 'del') {
      words[i - 1] = { word: bare(T[i - 1]), heard: null, score: 0, status: 'missed', note: 'This word was not heard' };
      i--;
    } else { extra.unshift(bare(H[j - 1])); j--; }
  }
  words.forEach((w) => {
    if (w.status === 'close') w.note = `Heard “${w.heard}”`;
    else if (w.status === 'incorrect') w.note = `Heard “${w.heard}” instead`;
  });
  return { words, extra, accuracy: n ? round(mean(words.map((w) => w.score))) : 0 };
}

// ── timing ─────────────────────────────────────────────────────────────────
const PAUSE_SEC = 0.35;       // a gap this long between two words counts as a pause
const LONG_PAUSE_SEC = 0.8;   // and this long as a hesitation

/** words: [{ word, start, end }] in seconds, from Whisper. Returns null when there are no word times. */
function timingMetrics(words, language = 'en') {
  const w = (words || []).filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end));
  if (w.length < 2) return null;
  const spoken = Math.max(0.1, w[w.length - 1].end - w[0].start);
  const gaps = [];
  for (let i = 1; i < w.length; i++) gaps.push(Math.max(0, w[i].start - w[i - 1].end));
  const pauses = gaps.filter((g) => g >= PAUSE_SEC);
  const longPauses = gaps.filter((g) => g >= LONG_PAUSE_SEC);
  const spaceless = language === 'ja' || language === 'zh' || language === 'ko';
  const wpm = spaceless ? null : round((w.length / spoken) * 60);
  const pace = wpm === null ? null : wpm < 80 ? 'slow' : wpm > 180 ? 'fast' : 'natural';
  return {
    spokenSeconds: Math.round(spoken * 10) / 10,
    wordCount: w.length,
    wordsPerMinute: wpm,
    pace,
    pauseCount: pauses.length,
    longPauseCount: longPauses.length,
    longestPause: gaps.length ? Math.round(Math.max(...gaps) * 10) / 10 : 0,
    pauseRatio: Math.round((gaps.reduce((s, g) => s + (g >= PAUSE_SEC ? g : 0), 0) / spoken) * 100) / 100,
    startDelay: Math.round(w[0].start * 10) / 10,
  };
}

// ── client measurements (pitch and loudness measured in the browser while recording) ────────────────
function cleanClientMetrics(m) {
  if (!m || typeof m !== 'object') return null;
  const num = (v, lo, hi) => (Number.isFinite(Number(v)) ? clamp(Number(v), lo, hi) : null);
  const out = {
    durationSec: num(m.durationSec, 0, 60),
    voicedRatio: num(m.voicedRatio, 0, 1),
    pitchMeanHz: num(m.pitchMeanHz, 0, 1200),
    pitchStdSemitones: num(m.pitchStdSemitones, 0, 24),
    pitchRangeSemitones: num(m.pitchRangeSemitones, 0, 48),
    loudnessMeanDb: num(m.loudnessMeanDb, -120, 0),
    loudnessStdDb: num(m.loudnessStdDb, 0, 60),
    voicedFrames: num(m.voicedFrames, 0, 100000),
  };
  return Object.values(out).some((v) => v !== null) ? out : null;
}

// ── scores ─────────────────────────────────────────────────────────────────
/**
 * Fluency: 100 minus a penalty for hesitations (long pauses, share of time spent paused) and for a pace far outside
 * what is comfortable (under 60 or over 200 words per minute).
 */
function fluencyScore(t) {
  if (!t || t.wordCount < 3) return null;
  let penalty = t.longPauseCount * 10 + t.pauseRatio * 60 + (t.startDelay > 1.5 ? 5 : 0);
  if (t.wordsPerMinute !== null) {
    if (t.wordsPerMinute < 60) penalty += Math.min(25, (60 - t.wordsPerMinute) * 0.5);
    if (t.wordsPerMinute > 200) penalty += Math.min(20, (t.wordsPerMinute - 200) * 0.3);
  }
  return clamp(round(100 - Math.min(70, penalty)), 0, 100);
}

// A spread that sits inside a comfortable band scores 100; flat or wild delivery loses points on either side.
const bandScore = (value, lo, hi, lowSlope, highSlope) => (value < lo ? 100 - (lo - value) * lowSlope : value > hi ? 100 - (value - hi) * highSlope : 100);

/** Intonation: how much the pitch moved. 2 to 6 semitones of spread is lively; under 1.5 sounds flat. Needs enough voiced audio. */
function intonationScore(c) {
  if (!c || c.pitchStdSemitones === null || (c.voicedFrames !== null && c.voicedFrames < 20)) return null;
  return clamp(round(bandScore(c.pitchStdSemitones, 2, 6, 35, 15)), 0, 100);
}

/** Stress and emphasis: how much the loudness moved. 3 to 9 dB of spread shows emphasis; very flat or very uneven loses points. */
function stressScore(c) {
  if (!c || c.loudnessStdDb === null || (c.voicedFrames !== null && c.voicedFrames < 20)) return null;
  return clamp(round(bandScore(c.loudnessStdDb, 3, 9, 20, 6)), 0, 100);
}

/** Clarity: how confidently the speech model understood the clip (mean word probability of its segments). */
function clarityScore(segments) {
  const probs = (segments || []).filter((s) => Number.isFinite(s.avg_logprob)).map((s) => Math.exp(Math.min(0, s.avg_logprob)));
  if (!probs.length) return null;
  return clamp(round(mean(probs) * 100), 0, 100);
}

// ── Whisper ────────────────────────────────────────────────────────────────
async function transcribeAudio(buffer, mime, language) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const ext = /mp4|m4a|aac/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : 'webm';
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime || 'audio/webm' }), `clip.${ext}`);
  form.append('model', WHISPER_MODEL);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');
  form.append('temperature', '0');
  if (language && /^[a-z]{2}$/i.test(language)) form.append('language', language.toLowerCase());

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error(`[Whisper] ${res.status}: ${body.slice(0, 200)}`);
    throw new Error(`Speech model request failed (${res.status})`);
  }
  const data = await res.json();
  return {
    text: String(data.text || '').trim(),
    duration: Number(data.duration) || null,
    words: (data.words || []).map((x) => ({ word: String(x.word || '').trim(), start: Number(x.start), end: Number(x.end) })),
    segments: data.segments || [],
  };
}

// ── readable summaries of the measurements, used as feedback when no AI advice is available ───────
function measuredAdvice({ timing, client, clarity, align }) {
  const tips = [];
  if (align) {
    const bad = align.words.filter((w) => w.status === 'incorrect' || w.status === 'missed').map((w) => w.word);
    const close = align.words.filter((w) => w.status === 'close').map((w) => w.word);
    if (bad.length) tips.push(`Practise these words slowly, then in the sentence: ${bad.slice(0, 4).join(', ')}.`);
    else if (close.length) tips.push(`Almost there. Say these a little more clearly: ${close.slice(0, 4).join(', ')}.`);
  }
  if (timing) {
    if (timing.longPauseCount > 0) tips.push(`You stopped for more than ${LONG_PAUSE_SEC} seconds ${timing.longPauseCount} time${timing.longPauseCount > 1 ? 's' : ''}. Read the phrase once silently, then say it in one go.`);
    if (timing.pace === 'slow') tips.push(`You spoke at about ${timing.wordsPerMinute} words per minute. A natural pace is closer to 100 to 150.`);
    if (timing.pace === 'fast') tips.push(`You spoke at about ${timing.wordsPerMinute} words per minute, which is fast. Slow down so each word is clear.`);
  }
  if (client && client.pitchStdSemitones !== null && client.pitchStdSemitones < 1.5) tips.push('Your pitch stayed very flat. Let your voice rise and fall a little, especially on the important words.');
  if (clarity !== null && clarity < 60) tips.push('The speech model was not sure what you said. Try a quieter room and speak a little closer to the microphone.');
  if (!tips.length) tips.push('Good work. Try the next phrase, or say this one again a bit faster.');
  return tips.slice(0, 4);
}

module.exports = {
  alignWords, timingMetrics, cleanClientMetrics, fluencyScore, intonationScore, stressScore, clarityScore,
  transcribeAudio, measuredAdvice, tokens, normalise, similarity, WHISPER_MODEL, PAUSE_SEC, LONG_PAUSE_SEC,
};
