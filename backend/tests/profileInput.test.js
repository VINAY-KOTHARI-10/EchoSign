'use strict';
const { cleanUsername, cleanBio, cleanLanguages } = require('../src/utils/profileInput');
const { can, permissionsFor } = require('../src/config/permissions');

describe('profile input', () => {
  test('a username is trimmed and must be 3 to 20 characters', () => {
    expect(cleanUsername('  Asha   Rao ')).toBe('Asha Rao');
    expect(() => cleanUsername('ab')).toThrow(/3 to 20/);
    expect(() => cleanUsername('x'.repeat(21))).toThrow(/3 to 20/);
    expect(() => cleanUsername('   ')).toThrow();
    expect(cleanUsername('a\u0000b\u0007c')).toBe('abc');
  });

  test('about-me is plain text of at most 200 characters, and empty clears it', () => {
    expect(cleanBio('  I teach   biology.  ')).toBe('I teach biology.');
    expect(cleanBio('')).toBeNull();
    expect(cleanBio(undefined)).toBeNull();
    expect(() => cleanBio('x'.repeat(201))).toThrow(/200/);
    expect(cleanBio('line one\n\n\n\n\nline two')).toBe('line one\n\nline two');
  });

  test('languages must be supported ones; a switched-off language is dropped, not an error', () => {
    const valid = new Set(['en', 'es', 'fr']);
    expect(cleanLanguages({ nativeLanguage: 'es', targetLanguages: ['en', 'xx', 'en', 'fr'] }, valid)).toEqual({ nativeLanguage: 'es', targetLanguages: ['en', 'fr'] });
    expect(() => cleanLanguages({ nativeLanguage: 'zz' }, valid)).toThrow(/native/);
    expect(() => cleanLanguages({ targetLanguages: 'en' }, valid)).toThrow();
    expect(cleanLanguages({}, valid)).toEqual({});
  });
});

describe('who may use the People directory', () => {
  test('teachers and admins can view people, only admins can edit, students can do neither', () => {
    expect(can({ role: 'TEACHER' }, 'people.view')).toBe(true);
    expect(can({ role: 'ADMIN' }, 'people.view')).toBe(true);
    expect(can({ role: 'USER' }, 'people.view')).toBe(false);
    expect(can({ role: 'MODERATOR' }, 'people.view')).toBe(false);
    expect(can({ role: 'ADMIN' }, 'people.edit')).toBe(true);
    expect(can({ role: 'TEACHER' }, 'people.edit')).toBe(false);
    expect(permissionsFor('TEACHER')).toContain('people.view');
    expect(permissionsFor('TEACHER')).not.toContain('people.edit');
  });
});
