// src/utils/translation.js
// Caption translation core: batching, a cache of successful results only, de-duplication of requests that are already
// running, and honest per-item failure reporting. The AI call is injected, so every path is unit-tested without an
// AI service.
//
// Contract: translate(target, texts) -> { translations: (string|null)[], failed: number[] }
//   * translations[i] is a real translation, or null when that item could not be translated (never the original text).
//   * failed lists the indexes of the null items, so a client can retry exactly those.
//   * Failures are never cached, so asking again really asks again.
'use strict';

const MAX_CACHE = 5000;

const usable = (value) => (typeof value === 'string' && value.trim().length > 0 ? value : null);

function createTranslator({ chat, maxCache = MAX_CACHE, logger = { warn() {} } }) {
  const cache = new Map();    // `${target}|${text}` -> translation (successes only)
  const inflight = new Map(); // same key -> Promise<string|null> while a request for it is running
  const key = (target, text) => `${target}|${text}`;

  // One AI request for `texts`; returns an array the same length with a string or null per item.
  const ask = async (target, texts) => {
    const result = await chat(
      'You translate classroom captions. Reply ONLY with JSON: {"translations": ["..."]} — one string per input, same order, no commentary.',
      `Translate each item into ${target}.\n${JSON.stringify(texts)}`,
      { maxTokens: 1500 },
    );
    if (result === null || result === undefined) {
      const err = new Error('Translation is not configured on this server');
      err.code = 'NOT_CONFIGURED';
      throw err;
    }
    const list = Array.isArray(result && result.translations) ? result.translations : [];
    return texts.map((_, i) => usable(list[i]));
  };

  // Ask, retry once when the whole request fails, then retry once for the items that came back empty.
  const fetchBatch = async (target, texts) => {
    let out;
    try { out = await ask(target, texts); } catch (err) {
      if (err.code === 'NOT_CONFIGURED') throw err;
      logger.warn(`Translation failed once, retrying: ${err.message}`);
      out = await ask(target, texts);
    }
    const missing = out.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
    if (missing.length && missing.length < texts.length) {
      try {
        const again = await ask(target, missing.map((i) => texts[i]));
        missing.forEach((idx, k) => { if (again[k] !== null) out[idx] = again[k]; });
      } catch (err) { logger.warn(`Retry for ${missing.length} empty translations failed: ${err.message}`); }
    }
    return out;
  };

  async function translate(target, texts) {
    const unique = [...new Set(texts)];
    const waiting = [];
    const toFetch = [];
    unique.forEach((t) => {
      const k = key(target, t);
      if (cache.has(k)) return;
      if (inflight.has(k)) waiting.push(inflight.get(k)); else toFetch.push(t);
    });

    if (toFetch.length) {
      const batch = fetchBatch(target, toFetch);
      batch.catch(() => {}); // the awaiting caller below reports it; avoid an unhandled rejection for waiters
      toFetch.forEach((t, i) => inflight.set(key(target, t), batch.then((list) => list[i]).catch(() => null)));
      try {
        const list = await batch;
        list.forEach((tr, i) => { if (tr) cache.set(key(target, toFetch[i]), tr); }); // successes only
        if (cache.size > maxCache) cache.clear();
      } finally {
        toFetch.forEach((t) => inflight.delete(key(target, t)));
      }
    }
    await Promise.all(waiting);

    const translations = texts.map((t) => cache.get(key(target, t)) ?? null);
    const failed = translations.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
    return { translations, failed };
  }

  return { translate, cacheSize: () => cache.size, inflightSize: () => inflight.size };
}

// Input checks shared by the controller and tests. Returns { texts } or throws a plain Error with .status = 400.
function validateInput({ texts, target }, resolveLanguage, { maxTexts = 20, maxLength = 500 } = {}) {
  const bad = (message) => Object.assign(new Error(message), { status: 400 });
  const language = resolveLanguage(target);
  if (!language) throw bad('Choose a supported language to translate into');
  if (!Array.isArray(texts) || texts.length === 0) throw bad('texts must be a non-empty list');
  if (texts.length > maxTexts) throw bad(`At most ${maxTexts} captions can be translated at once`);
  const clean = texts.map((t) => {
    if (typeof t !== 'string') throw bad('Every item in texts must be text');
    const s = t.trim();
    if (!s) throw bad('Captions to translate cannot be empty');
    if (s.length > maxLength) throw bad(`A caption is longer than ${maxLength} characters`);
    return s;
  });
  return { language, texts: clean };
}

module.exports = { createTranslator, validateInput };
