// End-to-end checks against a running server (see scripts/run-e2e.js). Real HTTP, real Socket.IO, real databases
// (throwaway schema / database). Only email and AI providers are absent, which is what the fallback tests rely on.
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');

const BASE = process.env.BASE_URL;
const { withRetry } = require('./retry');
const prisma = withRetry(require('../src/config/postgres').prisma);
const { connectMongoDB } = require('../src/config/mongodb');
const jwtHelper = require('../src/utils/jwtHelper');
const mongoose = require('mongoose');

const stamp = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sockets = [];

async function api(method, path, { body, token, cookie, origin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  const res = await fetch(`${BASE}/api/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function makeUser(label, role = 'USER') {
  const user = await prisma.user.create({
    data: { email: `${label}-${stamp}@test.local`, username: `${label}${String(stamp).slice(-6)}`, passwordHash: 'x', role, emailVerified: true, profile: { create: {} } },
  });
  const { accessToken, refreshToken } = await jwtHelper.generateTokenPair(user, {});
  return { ...user, token: accessToken, refresh: refreshToken };
}

function socketFor(token) {
  const s = connect(BASE, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
  sockets.push(s);
  return new Promise((resolve, reject) => { s.on('connect', () => resolve(s)); s.on('connect_error', reject); });
}
const ask = (s, event, payload) => new Promise((resolve) => s.emit(event, payload, resolve));
const waitFor = (s, event, ms = 20000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
  s.once(event, (data) => { clearTimeout(t); resolve(data); });
});

let admin; let teacher; let student; let student2; let outsider;
let classroom;

before(async () => {
  await connectMongoDB();
  admin = await makeUser('admin', 'ADMIN');
  teacher = await makeUser('teacher', 'TEACHER');
  student = await makeUser('student');
  student2 = await makeUser('student2');
  outsider = await makeUser('outsider');
});

after(async () => {
  sockets.forEach((s) => s.close());
  await prisma.$disconnect();
  await mongoose.disconnect();
});

describe('health and security headers', () => {
  it('liveness and readiness', async () => {
    assert.equal((await fetch(`${BASE}/health/live`)).status, 200);
    const ready = await fetch(`${BASE}/health/ready`);
    const body = await ready.json();
    assert.equal(ready.status, 200);
    assert.deepEqual(body.checks, { postgres: 'up', mongodb: 'up' });
  });
  it('sets CSP, permissions policy and a request id; hides the powered-by header', async () => {
    const res = await fetch(`${BASE}/health`);
    assert.match(res.headers.get('content-security-policy') || '', /default-src 'self'/);
    assert.match(res.headers.get('permissions-policy') || '', /camera=\(self\)/);
    assert.ok(res.headers.get('x-request-id'));
    assert.equal(res.headers.get('x-powered-by'), null);
  });
  it('returns sanitised errors with a request id', async () => {
    const r = await api('GET', '/nope');
    assert.equal(r.status, 404);
    assert.ok(r.json.requestId);
  });
});

describe('authentication', () => {
  const email = `reg-${stamp}@test.local`;
  let cookie;

  it('register reports honestly that the code email could not be sent', async () => {
    const r = await api('POST', '/auth/register', { body: { email, username: `reg${String(stamp).slice(-6)}`, password: 'Passw0rd!x' } });
    assert.equal(r.status, 201);
    assert.equal(r.json.requiresOtp, true);
    assert.equal(r.json.emailSent, false, 'no email provider is configured, so this must not claim success');
    assert.match(r.json.message, /could not email/i);
  });

  it('resend code fails loudly (502) when email cannot be sent', async () => {
    const reg = await api('POST', '/auth/register', { body: { email: `r2-${email}`, username: `rs${String(stamp).slice(-6)}`, password: 'Passw0rd!x' } });
    const r = await api('POST', '/auth/resend-otp', { body: { preAuthToken: reg.json.preAuthToken } });
    assert.equal(r.status, 502);
    assert.equal(r.json.code, 'EMAIL_FAILED');
  });

  it('unverified accounts cannot log in directly', async () => {
    const r = await api('POST', '/auth/login', { body: { email, password: 'Passw0rd!x' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.requiresOtp, true);
    assert.equal(r.json.data, undefined, 'no tokens before verification');
  });

  it('a verified account logs in and receives an httpOnly refresh cookie', async () => {
    await prisma.user.update({ where: { email }, data: { emailVerified: true } });
    const r = await api('POST', '/auth/login', { body: { email, password: 'Passw0rd!x' } });
    assert.equal(r.status, 200);
    const setCookie = r.headers.getSetCookie().join('\n');
    assert.match(setCookie, /refreshToken=.*HttpOnly/i);
    assert.ok(!JSON.stringify(r.json).includes('passwordHash'));
    cookie = setCookie.split('\n').find((c) => c.startsWith('refreshToken=')).split(';')[0];
  });

  it('refresh rotates the token; replaying the old one revokes every session', async () => {
    const first = await api('POST', '/auth/refresh', { cookie });
    assert.equal(first.status, 200);
    assert.ok(first.json.data.accessToken);
    const newCookie = first.headers.getSetCookie().find((c) => c.startsWith('refreshToken=')).split(';')[0];
    assert.notEqual(newCookie, cookie);
    await sleep(31000); // outside the 30 s grace window, a replay is an attack, not a slow network
    const replay = await api('POST', '/auth/refresh', { cookie });
    assert.equal(replay.status, 401);
    const afterRevoke = await api('POST', '/auth/refresh', { cookie: newCookie });
    assert.equal(afterRevoke.status, 401, 'reuse detection revoked the whole family');
  });

  it('cross-site requests carrying the cookie are blocked (CSRF)', async () => {
    const r = await api('POST', '/auth/refresh', { cookie: 'refreshToken=x', origin: 'https://evil.example' });
    assert.equal(r.status, 403);
    assert.equal(r.json.code, 'CSRF_BLOCKED');
  });

  it('an access-token cookie is no longer accepted (header only)', async () => {
    const r = await api('GET', '/users/me', { cookie: `accessToken=${student.token}` });
    assert.equal(r.status, 401);
  });

  it('logout-all revokes refresh tokens on every device', async () => {
    const u = await makeUser('multi');
    const second = await jwtHelper.generateTokenPair(u, {});
    const out = await api('POST', '/auth/logout-all', { token: u.token });
    assert.ok([200, 204].includes(out.status), `logout-all returned ${out.status}`);
    for (const t of [u.refresh, second.refreshToken]) {
      const r = await api('POST', '/auth/refresh', { cookie: `refreshToken=${t}` });
      assert.equal(r.status, 401);
    }
  });
});

describe('role-based access', () => {
  it('permissions endpoint reflects the account role', async () => {
    const s = await api('GET', '/users/permissions', { token: student.token });
    const t = await api('GET', '/users/permissions', { token: teacher.token });
    assert.ok(!s.json.data.permissions.includes('class.create'));
    assert.ok(t.json.data.permissions.includes('class.create'));
    assert.ok(s.json.data.matrix.length > 10);
  });
  it('a student cannot start a class; teacher and admin can', async () => {
    assert.equal((await api('POST', '/classrooms', { token: student.token, body: { title: 'x' } })).status, 403);
    const ok = await api('POST', '/classrooms', { token: teacher.token, body: { title: 'Physics: forces', language: 'en', keywords: ['force', 'mass'] } });
    assert.equal(ok.status, 201);
    classroom = ok.json.data.classroom;
    assert.match(classroom.code, /^[A-Z2-9]{6}$/);
  });
  it('admin routes are admin-only', async () => {
    assert.equal((await api('GET', '/admin/stats', { token: teacher.token })).status, 403);
    assert.equal((await api('GET', '/admin/stats', { token: student.token })).status, 403);
    assert.equal((await api('GET', '/admin/stats', { token: admin.token })).status, 200);
    assert.equal((await api('GET', '/admin/audit')).status, 401);
  });
  it('role changes are audited and the last admin is protected', async () => {
    const change = await api('PATCH', `/admin/users/${student2.id}/role`, { token: admin.token, body: { role: 'TEACHER' } });
    assert.equal(change.status, 200);
    const audit = await api('GET', '/admin/audit?action=user.role_change', { token: admin.token });
    assert.ok(audit.json.data.rows.some((r) => r.targetId === student2.id && r.meta.to === 'TEACHER' && r.actorName === admin.username));
    await api('PATCH', `/admin/users/${student2.id}/role`, { token: admin.token, body: { role: 'USER' } });
    const demote = await api('PATCH', `/admin/users/${admin.id}/role`, { token: admin.token, body: { role: 'USER' } });
    assert.equal(demote.status, 400);
  });
  it('deleting a teacher who hosts classes needs explicit confirmation', async () => {
    const host = await makeUser('delhost', 'TEACHER');
    await api('POST', '/classrooms', { token: host.token, body: { title: 'To delete' } });
    const first = await api('DELETE', `/admin/users/${host.id}`, { token: admin.token });
    assert.equal(first.status, 409);
    assert.equal(first.json.code, 'CONFIRM_REQUIRED');
    const done = await api('DELETE', `/admin/users/${host.id}?confirm=true`, { token: admin.token });
    assert.equal(done.status, 200);
  });
});

describe('classroom access and invitation codes', () => {
  it('captions and notes are not readable by someone who has not joined', async () => {
    const r = await api('GET', `/classrooms/${classroom.code}/captions`, { token: outsider.token });
    assert.equal(r.status, 403);
    assert.equal(r.json.code, 'NOT_A_MEMBER');
    assert.equal((await api('GET', `/classrooms/${classroom.code}/transcript`, { token: outsider.token })).status, 403);
    assert.equal((await api('POST', `/classrooms/${classroom.code}/ask`, { token: outsider.token, body: { question: 'what is force?' } })).status, 403);
    const info = await api('GET', `/classrooms/${classroom.code}`, { token: outsider.token });
    assert.equal(info.status, 200);
    assert.equal(info.json.data.isMember, false);
    assert.deepEqual(info.json.data.classroom.customGestures, []);
  });

  it('guessing codes is rate limited', async () => {
    const guesser = await makeUser('guesser');
    let last;
    for (let i = 0; i < 14; i += 1) last = await api('GET', '/classrooms/ZZZZZZ', { token: guesser.token });
    assert.equal(last.status, 429);
    assert.equal(last.json.code, 'TOO_MANY_ATTEMPTS');
    const s = await socketFor(guesser.token);
    const join = await ask(s, 'class:join', { code: classroom.code });
    assert.equal(join.ok, false, 'a blocked guesser cannot use the socket to bypass the limit');
    assert.equal(join.code, 'TOO_MANY_ATTEMPTS');
  });

  it('sockets require a valid token', async () => {
    await assert.rejects(socketFor('not-a-token'), /Authentication/);
    await assert.rejects(socketFor(''), /Authentication/);
  });
});

describe('live captions over sockets', () => {
  let host; let stu; let stuPhone;
  const ids = [];

  it('host and student join; the student appears once even with two devices', async () => {
    host = await socketFor(teacher.token);
    stu = await socketFor(student.token);
    const h = await ask(host, 'class:join', { code: classroom.code });
    assert.equal(h.ok, true);
    assert.equal(h.isHost, true);
    const a = await ask(stu, 'class:join', { code: classroom.code });
    assert.equal(a.ok, true);
    assert.equal(a.role, 'STUDENT');
    stuPhone = await socketFor(student.token);
    const b = await ask(stuPhone, 'class:join', { code: classroom.code });
    assert.equal(b.ok, true);
    assert.equal(b.count, 2, 'host + student = 2 people, not 3 sockets');
    assert.equal(b.participants.filter((p) => p.userId === student.id).length, 1);
    const member = await prisma.classroomMember.findFirst({ where: { classroomId: classroom.id, userId: student.id } });
    assert.equal(member.joins, 1, 'the second device did not add a join');
  });

  it('students can read captions after joining', async () => {
    const r = await api('GET', `/classrooms/${classroom.code}/captions`, { token: student.token });
    assert.equal(r.status, 200);
  });

  it('speech, typed and sign captions are stored once, in order, with the right speaker', async () => {
    const seen = [];
    stu.on('class:caption', (c) => seen.push(c));
    const send = async (socket, text, source) => {
      const ack = await ask(socket, 'class:caption', { code: classroom.code, text, source, clientId: `id-${ids.length}-${stamp}` });
      ids.push(ack.caption.id);
      return ack;
    };
    const one = await send(host, 'Force equals mass times acceleration.', 'SPEECH');
    await send(stu, 'Could you give an example?', 'TEXT');
    await send(stuPhone, 'F', 'SIGN');
    await send(host, 'A heavier cart needs a bigger push to speed up at the same rate.', 'SPEECH');
    assert.equal(one.caption.speakerId, teacher.id, 'speaker comes from the token, not the client');
    await sleep(300);
    assert.equal(seen.length, 4);
    const stored = await prisma.caption.findMany({ where: { classroomId: classroom.id }, orderBy: { createdAt: 'asc' } });
    assert.deepEqual(stored.map((c) => c.source), ['SPEECH', 'TEXT', 'SIGN', 'SPEECH']);
  });

  it('a retried send with the same clientId is not stored twice', async () => {
    const payload = { code: classroom.code, text: 'Retry me', source: 'TEXT', clientId: `retry-${stamp}-abcdef` };
    const first = await ask(stu, 'class:caption', payload);
    const second = await ask(stu, 'class:caption', payload);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(second.duplicate, true);
    assert.equal(second.caption.id, first.caption.id);
    assert.equal(await prisma.caption.count({ where: { classroomId: classroom.id, clientId: payload.clientId } }), 1);
  });

  it('REST fallback honours the same idempotency key', async () => {
    const body = { text: 'Sent over HTTP', source: 'TEXT', clientId: `http-${stamp}-abcdef` };
    const a = await api('POST', `/classrooms/${classroom.code}/captions`, { token: student.token, body });
    const b = await api('POST', `/classrooms/${classroom.code}/captions`, { token: student.token, body });
    assert.equal(a.status, 201);
    assert.equal(b.status, 200);
    assert.equal(b.json.data.duplicate, true);
  });

  it('captions are refused for someone who has not joined, and malformed payloads are ignored', async () => {
    const out = await socketFor(outsider.token);
    const denied = await ask(out, 'class:caption', { code: classroom.code, text: 'hi', source: 'TEXT' });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, 'NOT_JOINED');
    out.emit('class:caption', 'garbage');
    out.emit('class:caption', null);
    out.emit('class:interim', { code: { $ne: 1 }, text: 5 });
    await sleep(200);
    assert.equal(out.connected, true, 'malformed data did not crash the connection');
    out.close();
  });

  it('floods are rate limited per user, across devices', async () => {
    const flooder = await makeUser('flooder');
    const fs1 = await socketFor(flooder.token);
    await ask(fs1, 'class:join', { code: classroom.code });
    // One burst (the database is far away, so sequential sends would be slower than the limiter's window).
    const results = await Promise.all(Array.from({ length: 45 }, (_, i) => ask(fs1, 'class:caption', { code: classroom.code, text: `spam ${i}`, source: 'TEXT' })));
    const limited = results.filter((r) => r.code === 'RATE_LIMITED').length;
    assert.ok(limited >= 10, `expected rate limiting, got ${limited} rejections`);
    assert.ok(results.some((r) => r.ok), 'some captions in the burst were accepted');
    fs1.close();
  });

  it('a student who was offline receives exactly the captions they missed', async () => {
    const lateStudent = await makeUser('late');
    let s = await socketFor(lateStudent.token);
    const joined = await ask(s, 'class:join', { code: classroom.code });
    assert.equal(joined.ok, true);
    const last = await ask(host, 'class:caption', { code: classroom.code, text: 'Last line before disconnect', source: 'SPEECH' });
    s.close();
    await sleep(300);
    const a = await ask(host, 'class:caption', { code: classroom.code, text: 'Missed one', source: 'SPEECH' });
    const b = await ask(host, 'class:caption', { code: classroom.code, text: 'Missed two', source: 'SPEECH' });
    s = await socketFor(lateStudent.token);
    const back = await ask(s, 'class:join', { code: classroom.code, sinceId: last.caption.id });
    assert.equal(back.ok, true);
    assert.deepEqual(back.missed.map((c) => c.id), [a.caption.id, b.caption.id]);
    assert.equal(back.resync, false);
    const unknown = await ask(s, 'class:join', { code: classroom.code, sinceId: 'does-not-exist' });
    assert.equal(unknown.resync, true, 'an unknown anchor asks the client to reload instead of guessing');
    const rest = await api('GET', `/classrooms/${classroom.code}/captions?after=${last.caption.id}`, { token: lateStudent.token });
    assert.equal(rest.json.data.captions.length, 2);
    s.close();
  });

  it('attendance: one device leaving keeps the person present; leaving fully records departure; returning is a reconnection', async () => {
    stuPhone.close();
    await sleep(2500);
    let m = await prisma.classroomMember.findFirst({ where: { classroomId: classroom.id, userId: student.id } });
    assert.equal(m.lastLeftAt, null, 'still present on the other device');
    stu.emit('class:leave', { code: classroom.code }); // no ack for leave
    await sleep(2500);
    m = await prisma.classroomMember.findFirst({ where: { classroomId: classroom.id, userId: student.id } });
    assert.ok(m.lastLeftAt, 'departure recorded when the last device left');
    const again = await socketFor(student.token);
    const j = await ask(again, 'class:join', { code: classroom.code });
    assert.equal(j.ok, true);
    m = await prisma.classroomMember.findFirst({ where: { classroomId: classroom.id, userId: student.id } });
    assert.equal(m.joins, 2);
    assert.equal(m.reconnects, 1);
    stu = again;
  });

  it('raised hands are per person and only moderators can lower someone else\'s', async () => {
    const hands = waitFor(host, 'class:hands');
    stu.emit('class:hand', { code: classroom.code, raised: true });
    assert.equal((await hands).length, 1);
    stu.emit('class:hand:lower', { code: classroom.code, userId: student.id });
    await sleep(200);
    const lowered = waitFor(host, 'class:hands');
    host.emit('class:hand:lower', { code: classroom.code, userId: student.id });
    assert.equal((await lowered).length, 0);
  });

  it('community chat only works in listed rooms the socket has joined', async () => {
    const s = await socketFor(student.token);
    const got = [];
    s.on('chat:message', (m) => got.push(m));
    s.emit('chat:message', { roomId: 'global', content: 'not joined yet' });
    s.emit('chat:join', 'made-up-room');
    s.emit('chat:message', { roomId: 'made-up-room', content: 'nope' });
    await sleep(300);
    assert.equal(got.length, 0);
    s.emit('chat:join', 'global');
    await sleep(100);
    const delivered = waitFor(s, 'chat:message');
    s.emit('chat:message', { roomId: 'global', content: 'hello class' });
    await delivered;
    assert.equal(got.length, 1);
    assert.equal((await api('GET', '/chat/messages?roomId=secret-room', { token: student.token })).status, 404);
    s.close();
  });

  it('practice sessions can only be joined by their owner', async () => {
    const mine = await prisma.practiceSession.create({ data: { userId: student.id, language: 'en', duration: 1, accuracy: 80, wordsAttempted: 1, wordsCorrect: 1 } });
    const s = await socketFor(outsider.token);
    const err = waitFor(s, 'session:error');
    s.emit('session:start', { sessionId: mine.id });
    assert.match((await err).message, /not found/i);
    s.close();
  });
});

describe('transcripts, exports, notes and questions', () => {
  it('transcript pages through every caption with search, speaker and source filters', async () => {
    const all = await api('GET', `/classrooms/${classroom.code}/transcript?limit=5`, { token: student.token });
    assert.equal(all.status, 200);
    assert.equal(all.json.data.captions.length, 5);
    assert.ok(all.json.data.nextCursor);
    const seen = new Set(all.json.data.captions.map((c) => c.id));
    let cursor = all.json.data.nextCursor;
    while (cursor) {
      const page = await api('GET', `/classrooms/${classroom.code}/transcript?limit=5&cursor=${cursor}`, { token: student.token });
      page.json.data.captions.forEach((c) => { assert.ok(!seen.has(c.id), 'no caption appears on two pages'); seen.add(c.id); });
      cursor = page.json.data.nextCursor;
    }
    assert.equal(seen.size, all.json.data.total, 'paging reached every caption');

    const search = await api('GET', `/classrooms/${classroom.code}/transcript?q=ACCELERATION`, { token: student.token });
    assert.equal(search.json.data.captions.length, 1);
    const sign = await api('GET', `/classrooms/${classroom.code}/transcript?source=SIGN`, { token: student.token });
    assert.equal(sign.json.data.captions.length, 1);
    const bySpeaker = await api('GET', `/classrooms/${classroom.code}/transcript?speaker=${teacher.id}`, { token: student.token });
    assert.ok(bySpeaker.json.data.captions.every((c) => c.speakerId === teacher.id));
    const jump = await api('GET', `/classrooms/${classroom.code}/transcript?at=0`, { token: student.token });
    assert.equal(jump.status, 200);
  });

  it('exports TXT, SRT and a printable page', async () => {
    const txt = await api('GET', `/classrooms/${classroom.code}/export?format=txt`, { token: student.token });
    assert.match(txt.headers.get('content-type'), /text\/plain/);
    assert.match(txt.text, /Physics: forces/);
    assert.match(txt.text, /\] .*\(speech\): Force equals mass times acceleration\./);
    const srt = await api('GET', `/classrooms/${classroom.code}/export?format=srt`, { token: student.token });
    assert.match(srt.text, /^1\n00:00:00,000 --> 00:00:0\d,\d{3}\n/);
    const html = await api('GET', `/classrooms/${classroom.code}/export?format=html`, { token: student.token });
    assert.match(html.text, /<table>/);
    assert.ok(!/<script/i.test(html.text), 'the print page has no inline script (CSP-safe)');
  });

  it('a captioner or host can correct a caption; a student cannot correct someone else\'s', async () => {
    const list = await api('GET', `/classrooms/${classroom.code}/transcript?q=Force equals`, { token: teacher.token });
    const cap = list.json.data.captions[0];
    const denied = await api('PATCH', `/classrooms/${classroom.code}/captions/${cap.id}`, { token: student.token, body: { text: 'tampered' } });
    assert.equal(denied.status, 403);
    const ok = await api('PATCH', `/classrooms/${classroom.code}/captions/${cap.id}`, { token: teacher.token, body: { text: 'Force equals mass times acceleration (F = ma).' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.data.caption.originalText, 'Force equals mass times acceleration.');
    assert.equal(ok.json.data.caption.editedById, teacher.id);
  });

  it('notes fall back to a clearly labelled basic summary when AI is unavailable', async () => {
    assert.equal((await api('POST', `/classrooms/${classroom.code}/summary`, { token: student.token })).status, 403);
    const r = await api('POST', `/classrooms/${classroom.code}/summary`, { token: teacher.token });
    assert.equal(r.status, 200);
    assert.equal(r.json.data.summary.provider, 'basic');
    assert.match(r.json.data.summary.fallbackReason, /not configured/i);
    assert.ok(r.json.data.summary.notes.length > 0);
    assert.ok(r.json.data.summary.captionCount >= 4);
    const read = await api('GET', `/classrooms/${classroom.code}/summary`, { token: student.token });
    assert.equal(read.json.data.summary.provider, 'basic');
  });

  it('ask-your-lecture falls back to timestamped transcript search, and never invents an answer', async () => {
    const hit = await api('POST', `/classrooms/${classroom.code}/ask`, { token: student.token, body: { question: 'What did you say about acceleration?' } });
    assert.equal(hit.status, 200);
    assert.equal(hit.json.data.provider, 'search');
    assert.ok(hit.json.data.references.length >= 1);
    assert.match(hit.json.data.references[0].at, /^\d\d:\d\d/);
    assert.match(hit.json.data.references[0].text, /acceleration/i);
    const miss = await api('POST', `/classrooms/${classroom.code}/ask`, { token: student.token, body: { question: 'Explain photosynthesis chloroplasts' } });
    assert.equal(miss.json.data.covered, false);
    assert.equal(miss.json.data.references.length, 0);
  });

  it('translation reports that it is unavailable rather than faking it', async () => {
    const r = await api('POST', `/classrooms/${classroom.code}/translate`, { token: student.token, body: { target: 'Hindi', texts: ['Hello'] } });
    assert.equal(r.status, 503);
  });
});

describe('dashboards', () => {
  it('teacher analytics come from real records', async () => {
    const r = await api('GET', '/classrooms/stats', { token: teacher.token });
    assert.equal(r.status, 200);
    const d = r.json.data;
    assert.ok(d.totals.classrooms >= 1);
    assert.ok(d.totals.captions >= 8);
    assert.ok(d.bySource.SPEECH >= 3 && d.bySource.SIGN >= 1 && d.bySource.TEXT >= 2);
    assert.ok(d.totals.attendance >= 2, 'students counted once each');
    assert.ok(d.topics.some((t) => t.topic === 'force'));
    assert.equal(d.totals.summaries, 1);
    assert.equal((await api('GET', '/classrooms/stats', { token: student.token })).status, 403);
  });
  it('the student library lists attended classes with notes', async () => {
    const r = await api('GET', '/classrooms/attended', { token: student.token });
    assert.equal(r.status, 200);
    const mine = r.json.data.classes.find((c) => c.code === classroom.code);
    assert.ok(mine);
    assert.equal(mine.hasNotes, true);
    assert.equal(mine.teacher, teacher.username);
    assert.equal((await api('GET', '/classrooms/attended', { token: outsider.token })).json.data.classes.length, 0);
  });
  it('insights include attendance details', async () => {
    const r = await api('GET', `/classrooms/${classroom.code}/insights`, { token: teacher.token });
    assert.equal(r.status, 200);
    const row = r.json.data.attendance.find((a) => a.userId === student.id);
    assert.equal(row.reconnects, 1);
    assert.ok(row.lastLeftAt);
    assert.equal((await api('GET', `/classrooms/${classroom.code}/insights`, { token: student.token })).status, 403);
  });
  it('admin stats expose service status without secrets', async () => {
    const r = await api('GET', '/admin/stats', { token: admin.token });
    assert.deepEqual(r.json.data.services.ai, { configured: false, model: null });
    assert.equal(r.json.data.services.email.configured, false);
    assert.ok(!JSON.stringify(r.json).includes('gsk_'));
  });
});

describe('ending and reopening a class', () => {
  it('students are told, attendance time is finalised, and the class cannot be joined until reopened', async () => {
    const watcher = await socketFor(student2.token);
    assert.equal((await ask(watcher, 'class:join', { code: classroom.code })).ok, true);
    const ended = waitFor(watcher, 'class:ended');
    assert.equal((await api('POST', `/classrooms/${classroom.code}/end`, { token: student.token })).status, 403);
    assert.equal((await api('POST', `/classrooms/${classroom.code}/end`, { token: teacher.token })).status, 200);
    assert.equal((await ended).code, classroom.code);
    await sleep(500);
    const m = await prisma.classroomMember.findFirst({ where: { classroomId: classroom.id, userId: student2.id } });
    assert.ok(m.lastLeftAt, 'finishing the class closes everyone\'s attendance');
    const late = await socketFor(outsider.token);
    const join = await ask(late, 'class:join', { code: classroom.code });
    assert.equal(join.ok, false);
    assert.equal(join.code, 'ENDED');
    const post = await api('POST', `/classrooms/${classroom.code}/captions`, { token: student.token, body: { text: 'too late' } });
    assert.equal(post.status, 409);
    const transcript = await api('GET', `/classrooms/${classroom.code}/transcript`, { token: student.token });
    assert.equal(transcript.status, 200, 'the transcript stays readable after the class ends');
    assert.equal((await api('POST', `/classrooms/${classroom.code}/reopen`, { token: teacher.token })).status, 200);
    assert.equal((await ask(late, 'class:join', { code: classroom.code })).ok, true);
    watcher.close(); late.close();
    const audit = await api('GET', '/admin/audit?action=class.end', { token: admin.token });
    assert.ok(audit.json.data.rows.some((r) => r.targetId === classroom.id));
  });
});
