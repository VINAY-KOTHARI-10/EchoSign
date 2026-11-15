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

module.exports = { LANGUAGES, resolveLanguage };
