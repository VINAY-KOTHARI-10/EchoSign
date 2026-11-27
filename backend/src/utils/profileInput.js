// src/utils/profileInput.js
// Checks for the profile fields a person (or an admin) can change. Pure functions, so they are tested.
'use strict';

const { AppError } = require('../middleware/errorMiddleware');

// 3 to 20 characters, the same length rule as registration. No control characters, and not only spaces.
function cleanUsername(value) {
  const name = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (name.length < 3 || name.length > 20) throw new AppError('Choose a username of 3 to 20 characters.', 400, 'INVALID_USERNAME');
  return name;
}

// A short "about me": up to 200 characters, plain text. An empty string clears it.
function cleanBio(value) {
  const text = String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length > 200) throw new AppError('Keep your about-me to 200 characters or fewer.', 400, 'INVALID_BIO');
  return text || null;
}

// Languages must come from the supported list; one that was switched off is dropped instead of failing the whole save.
function cleanLanguages({ nativeLanguage, targetLanguages, teachingLanguages }, valid) {
  const out = {};
  if (nativeLanguage !== undefined) {
    if (typeof nativeLanguage !== 'string' || !valid.has(nativeLanguage)) throw new AppError('Choose one of the supported native languages.', 400, 'INVALID_LANGUAGE');
    out.nativeLanguage = nativeLanguage;
  }
  if (targetLanguages !== undefined) {
    if (!Array.isArray(targetLanguages) || targetLanguages.some((c) => typeof c !== 'string')) throw new AppError('Choose languages from the supported list.', 400, 'INVALID_LANGUAGE');
    out.targetLanguages = [...new Set(targetLanguages.filter((c) => valid.has(c)))];
  }
  if (teachingLanguages !== undefined) {
    if (!Array.isArray(teachingLanguages) || teachingLanguages.some((c) => typeof c !== 'string')) throw new AppError('Choose languages from the supported list.', 400, 'INVALID_LANGUAGE');
    out.teachingLanguages = [...new Set(teachingLanguages.filter((c) => valid.has(c)))];
  }
  return out;
}

module.exports = { cleanUsername, cleanBio, cleanLanguages };
