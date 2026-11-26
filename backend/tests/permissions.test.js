'use strict';
// The permission tables are the single source of truth for who may do what. These tests state the expected rules
// explicitly, so changing a rule by accident fails here, and they check that no controller asks about a permission
// that does not exist.
const fs = require('fs');
const path = require('path');
const {
  PERMISSIONS, CLASS_PERMISSIONS, can, permissionsFor, matrix, classMatrix, classRoleFor, canInClass, canModerateClass,
} = require('../src/config/permissions');

const classroom = { id: 'c1', hostId: 'host-1' };
const user = (id, role = 'USER') => ({ id, role });

describe('account permissions', () => {
  it('students can learn and join, but not teach or administer', () => {
    const s = user('s');
    ['class.join', 'captions.read', 'captions.send', 'transcript.export', 'notes.read', 'lecture.ask', 'practice.use', 'community.chat'].forEach((p) => expect(can(s, p)).toBe(true));
    ['class.create', 'class.manage_own', 'class.manage_any', 'notes.generate', 'analytics.class', 'admin.panel', 'users.view', 'users.manage', 'audit.view', 'languages.manage'].forEach((p) => expect(can(s, p)).toBe(false));
  });

  it('teachers can teach but not administer', () => {
    const t = user('t', 'TEACHER');
    ['class.create', 'class.manage_own', 'notes.generate', 'analytics.class', 'captions.edit'].forEach((p) => expect(can(t, p)).toBe(true));
    ['class.manage_any', 'admin.panel', 'users.view', 'users.manage', 'audit.view', 'languages.manage'].forEach((p) => expect(can(t, p)).toBe(false));
  });

  it('admins can do everything in the table', () => {
    const a = user('a', 'ADMIN');
    Object.keys(PERMISSIONS).forEach((p) => expect(can(a, p)).toBe(true));
  });

  it('the old MODERATOR role is a plain member, and unknown permissions or people are refused', () => {
    expect(can(user('m', 'MODERATOR'), 'class.create')).toBe(false);
    expect(permissionsFor('MODERATOR')).toEqual(permissionsFor('USER'));
    expect(can(user('s'), 'no.such.permission')).toBe(false);
    expect(can(null, 'class.join')).toBe(false);
  });

  it('the table shown to people lists every permission', () => {
    expect(matrix().map((r) => r.key).sort()).toEqual(Object.keys(PERMISSIONS).sort());
  });
});

describe('roles inside a class', () => {
  it('the host and any admin are HOST; a captioner row makes a CAPTIONER; everyone else is a STUDENT', () => {
    expect(classRoleFor(classroom, user('host-1', 'TEACHER'))).toBe('HOST');
    expect(classRoleFor(classroom, user('someone', 'ADMIN'))).toBe('HOST');
    expect(classRoleFor(classroom, user('cap'), 'CAPTIONER')).toBe('CAPTIONER');
    expect(classRoleFor(classroom, user('pupil'), 'STUDENT')).toBe('STUDENT');
    expect(classRoleFor(classroom, user('pupil'))).toBe('STUDENT');
  });

  it('another teacher is only a student in a class they do not host', () => {
    expect(classRoleFor(classroom, user('other-teacher', 'TEACHER'))).toBe('STUDENT');
  });

  it('a stored role cannot make someone a host', () => {
    expect(classRoleFor(classroom, user('pupil'), 'HOST')).toBe('STUDENT');
  });

  it('what each class role may do', () => {
    const rows = {
      'captions.send': { HOST: true, CAPTIONER: true, STUDENT: true },
      'captions.edit_any': { HOST: true, CAPTIONER: true, STUDENT: false },
      'notes.generate': { HOST: true, CAPTIONER: true, STUDENT: false },
      'insights.view': { HOST: true, CAPTIONER: true, STUDENT: false },
      'class.settings': { HOST: true, CAPTIONER: false, STUDENT: false },
      'class.roles': { HOST: true, CAPTIONER: false, STUDENT: false },
    };
    expect(Object.keys(rows).sort()).toEqual(Object.keys(CLASS_PERMISSIONS).sort());
    Object.entries(rows).forEach(([perm, byRole]) => Object.entries(byRole).forEach(([role, allowed]) => {
      expect([perm, role, canInClass(role, perm)]).toEqual([perm, role, allowed]);
    }));
  });

  it('unknown roles and permissions are refused', () => {
    expect(canInClass('STUDENT', 'class.settings')).toBe(false);
    expect(canInClass('HOST', 'no.such.thing')).toBe(false);
    expect(canInClass(undefined, 'captions.send')).toBe(false);
  });

  it('canModerateClass is the same rule as correcting any caption', () => {
    ['HOST', 'CAPTIONER', 'STUDENT'].forEach((r) => expect(canModerateClass(r)).toBe(canInClass(r, 'captions.edit_any')));
  });

  it('the class table shown to people lists every class permission', () => {
    expect(classMatrix().map((r) => r.key).sort()).toEqual(Object.keys(CLASS_PERMISSIONS).sort());
  });
});

describe('the code only asks about permissions that exist', () => {
  const read = (rel) => fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf8');
  const asked = (src) => [...src.matchAll(/canInClass\([^,]+(?:\([^)]*\))?[^,]*,\s*'([^']+)'\)/g)].map((m) => m[1]);

  it('controllers and sockets use known class permissions', () => {
    const keys = [...asked(read('controllers/classroomController.js')), ...asked(read('sockets/socketManager.js'))];
    expect(keys.length).toBeGreaterThan(5);
    keys.forEach((k) => expect(Object.keys(CLASS_PERMISSIONS)).toContain(k));
  });

  it('there is one definition of who is a host or captioner: no private copies', () => {
    const controller = read('controllers/classroomController.js');
    const sockets = read('sockets/socketManager.js');
    expect(controller).not.toMatch(/role === 'HOST' \|\| role === 'CAPTIONER'/);
    expect(controller).not.toMatch(/\.role === 'CAPTIONER'/);
    expect(sockets).not.toMatch(/user\.role === 'ADMIN'/);
  });
});
