// src/config/languages.js
// Languages captions can be translated into. Same list as the frontend's language picker (name or code is accepted).
'use strict';

const LANGUAGES = [
  { code: 'en', name: 'English' }, { code: 'fr', name: 'French' }, { code: 'es', name: 'Spanish' }, { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' }, { code: 'zh', name: 'Mandarin Chinese' }, { code: 'it', name: 'Italian' }, { code: 'pt', name: 'Portuguese' },
  { code: 'ko', name: 'Korean' }, { code: 'ar', name: 'Arabic' }, { code: 'ru', name: 'Russian' }, { code: 'hi', name: 'Hindi' },
];

// 'hindi' | 'Hindi' | 'hi' -> 'Hindi', or null when it is not a supported language.
const resolveLanguage = (value) => {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  const hit = LANGUAGES.find((l) => l.name.toLowerCase() === v || l.code === v);
  return hit ? hit.name : null;
};

// The languages in effect: the built-in list, plus every active language an admin added, minus any language an admin
// switched off. (Admin rows are the adjustments; with no rows, the built-in list applies unchanged.)
const effectiveLanguages = (rows = []) => {
  const map = new Map(LANGUAGES.map((l) => [l.code, { code: l.code, name: l.name, flag: '' }]));
  rows.forEach((r) => {
    if (!r.active) map.delete(r.code);
    else map.set(r.code, { code: r.code, name: r.name, flag: r.flag || '' });
  });
  return [...map.values()];
};

let cached = { at: 0, list: null };
const TTL_MS = 30000;

// The list currently in effect, read from the database at most every 30 seconds. If the database cannot be read the
// built-in list keeps the app working.
async function activeLanguages(prisma) {
  if (cached.list && Date.now() - cached.at < TTL_MS) return cached.list;
  try {
    const rows = await prisma.language.findMany({ select: { code: true, name: true, flag: true, active: true } });
    cached = { at: Date.now(), list: effectiveLanguages(rows) };
  } catch {
    cached = { at: Date.now() - TTL_MS + 5000, list: effectiveLanguages([]) };
  }
  return cached.list;
}

// Call after an admin adds, edits or deletes a language, so the change is seen straight away.
const invalidateLanguages = () => { cached = { at: 0, list: null }; };

// Same behaviour as resolveLanguage, over any list.
const makeResolver = (list) => (value) => {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  const hit = list.find((l) => l.name.toLowerCase() === v || l.code === v);
  return hit ? hit.name : null;
};

module.exports = { LANGUAGES, resolveLanguage, effectiveLanguages, activeLanguages, invalidateLanguages, makeResolver };
