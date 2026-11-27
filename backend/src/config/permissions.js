// src/config/permissions.js
// The single source of truth for who may do what. Controllers, sockets and the frontend (via GET /users/permissions)
// all read this table instead of comparing role names, so a rule changes in one place.
//
// Account roles:  USER (member/student)  <  TEACHER  <  ADMIN.  MODERATOR is legacy and treated as USER.
// In-class roles: STUDENT < CAPTIONER < HOST   (HOST is the teacher who created the class, or any ADMIN).
'use strict';

const PERMISSIONS = {
  // Classrooms
  'class.join':           { roles: ['USER', 'TEACHER', 'ADMIN'], label: 'Join a class with a code' },
  'class.create':         { roles: ['TEACHER', 'ADMIN'], label: 'Start a class' },
  'class.manage_own':     { roles: ['TEACHER', 'ADMIN'], label: 'End, reopen and edit their own classes' },
  'class.manage_any':     { roles: ['ADMIN'], label: 'Manage any class' },
  'captions.read':        { roles: ['USER', 'TEACHER', 'ADMIN'], label: 'Read captions and transcripts of classes they attend' },
  'captions.send':        { roles: ['USER', 'TEACHER', 'ADMIN'], label: 'Send speech, sign or typed captions' },
  'captions.edit':        { roles: ['TEACHER', 'ADMIN'], label: 'Correct any caption (hosts and captioners)' },
  'transcript.export':    { roles: ['USER', 'TEACHER', 'ADMIN'], label: 'Download transcripts (TXT, SRT, print)' },
  'notes.generate':       { roles: ['TEACHER', 'ADMIN'], label: 'Generate AI lecture notes' },
  'notes.read':           { roles: ['USER', 'TEACHER', 'ADMIN'], label: 'Read lecture notes and quizzes' },
  'lecture.ask':          { roles: ['USER', 'TEACHER', 'ADMIN'], label: 'Ask questions about a lecture' },
  'analytics.class':      { roles: ['TEACHER', 'ADMIN'], label: 'See attendance and class analytics' },
  // Learning
  'practice.use':         { roles: ['USER', 'TEACHER', 'ADMIN'], label: 'Practice, AI partner, sign lab, progress' },
  'community.chat':       { roles: ['USER', 'TEACHER', 'ADMIN'], label: 'Use community chat' },
  'meet.use':             { roles: ['USER', 'TEACHER', 'ADMIN'], label: 'Join Sign Meet video meetings (works on a hotspot)' },
  // Administration
  'admin.panel':          { roles: ['ADMIN'], label: 'Open the admin panel' },
  'users.view':           { roles: ['ADMIN'], label: 'View all users' },
  'people.view':          { roles: ['TEACHER', 'ADMIN'], label: 'Find people and see profiles (teachers: students in their own classes)' },
  'people.edit':          { roles: ['ADMIN'], label: 'Edit anyone\'s profile' },
  'users.manage':         { roles: ['ADMIN'], label: 'Change roles and delete users' },
  'audit.view':           { roles: ['ADMIN'], label: 'View the audit log' },
  'languages.manage':     { roles: ['ADMIN'], label: 'Add and edit languages' },
};

// MODERATOR was an old role. Treat it as a normal member so old accounts keep working, with no extra power.
const effectiveRole = (role) => (role === 'MODERATOR' ? 'USER' : role || 'USER');

const can = (user, permission) => {
  const rule = PERMISSIONS[permission];
  return Boolean(rule && user && rule.roles.includes(effectiveRole(user.role)));
};

// What a given account role may do, as a plain list (sent to the frontend).
const permissionsFor = (role) => Object.keys(PERMISSIONS).filter((p) => PERMISSIONS[p].roles.includes(effectiveRole(role)));

// The matrix shown on the "Roles & permissions" page.
const matrix = () => Object.entries(PERMISSIONS).map(([key, { roles, label }]) => ({
  key, label, USER: roles.includes('USER'), TEACHER: roles.includes('TEACHER'), ADMIN: roles.includes('ADMIN'),
}));

const IN_CLASS_ROLES = ['STUDENT', 'CAPTIONER', 'HOST'];

// Rights INSIDE one class. A person's account role (above) says what they may do in the app; their role in a class says
// what they may do there: the host is the teacher who started it (or any admin), a captioner is a student the host
// trusts, everyone else who joined is a student. Every class check (HTTP controllers and the socket layer) reads this
// table, so a rule is changed in exactly one place.
const CLASS_PERMISSIONS = {
  'captions.send':     { roles: ['HOST', 'CAPTIONER', 'STUDENT'], label: 'Read and send captions, raise a hand, use notes and ask the lecture' },
  'captions.edit_any': { roles: ['HOST', 'CAPTIONER'], label: 'Correct anyone\'s caption and lower raised hands (students can correct only their own)' },
  'notes.generate':    { roles: ['HOST', 'CAPTIONER'], label: 'Generate lecture notes' },
  'insights.view':     { roles: ['HOST', 'CAPTIONER'], label: 'See class insights and attendance' },
  'class.settings':    { roles: ['HOST'], label: 'Change class settings, end and reopen the class' },
  'class.roles':       { roles: ['HOST'], label: 'Give or remove captioner rights' },
};

// The in-class role for someone, as a pure function so HTTP and sockets cannot disagree. `memberRole` is the role
// stored on their membership row, if they have one. Site admins always act as the host.
const classRoleFor = (classroom, user, memberRole) => {
  if (classroom && user && (classroom.hostId === user.id || user.role === 'ADMIN')) return 'HOST';
  return memberRole === 'CAPTIONER' ? 'CAPTIONER' : 'STUDENT';
};

const canInClass = (classRole, permission) => {
  const rule = CLASS_PERMISSIONS[permission];
  return Boolean(rule && rule.roles.includes(classRole));
};

const canModerateClass = (classRole) => canInClass(classRole, 'captions.edit_any');

const classMatrix = () => Object.entries(CLASS_PERMISSIONS).map(([key, { roles, label }]) => ({
  key, label, HOST: roles.includes('HOST'), CAPTIONER: roles.includes('CAPTIONER'), STUDENT: roles.includes('STUDENT'),
}));

module.exports = { PERMISSIONS, can, permissionsFor, matrix, effectiveRole, IN_CLASS_ROLES, CLASS_PERMISSIONS, classRoleFor, canInClass, canModerateClass, classMatrix };
