import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayLabel, layoutMessages, roleTag, formatSize, attachProblem, senderColor, upsertMessage, markDeleted, setReactions, reactionSummary, myReaction, previewText, typingText, initials,
} from '../src/lib/chatUtils.js';

const NOW = new Date('2026-11-28T12:00:00');
const at = (iso) => new Date(iso);
const msg = (id, user, iso, extra = {}) => ({ id, user: { id: user, username: user.toUpperCase() }, createdAt: at(iso), content: `text ${id}`, reactions: [], replyTo: null, ...extra });

test('day labels: today, yesterday, weekday, date', () => {
  assert.equal(dayLabel(at('2026-11-28T08:00:00'), NOW), 'Today');
  assert.equal(dayLabel(at('2026-11-27T23:00:00'), NOW), 'Yesterday');
  assert.equal(dayLabel(at('2026-11-25T10:00:00'), NOW), at('2026-11-25T10:00:00').toLocaleDateString([], { weekday: 'long' }));
  assert.match(dayLabel(at('2026-10-01T10:00:00'), NOW), /Oct/);
});

test('layout adds a day divider per day and marks the first message of each run', () => {
  const list = layoutMessages([
    msg('1', 'a', '2026-11-27T10:00:00'), msg('2', 'a', '2026-11-27T10:01:00'), msg('3', 'b', '2026-11-27T10:02:00'),
    msg('4', 'b', '2026-11-28T09:00:00'),
  ], NOW);
  assert.deepEqual(list.map((x) => x.type), ['day', 'msg', 'msg', 'msg', 'day', 'msg']);
  assert.deepEqual(list.filter((x) => x.type === 'msg').map((x) => x.first), [true, false, true, true]);
  assert.equal(list[0].label, 'Yesterday');
});

test('a long pause starts a new run even from the same person', () => {
  const list = layoutMessages([msg('1', 'a', '2026-11-28T10:00:00'), msg('2', 'a', '2026-11-28T10:30:00')], NOW);
  assert.deepEqual(list.filter((x) => x.type === 'msg').map((x) => x.first), [true, true]);
});

test('sender colours are steady and differ between people', () => {
  assert.equal(senderColor('abc'), senderColor('abc'));
  assert.notEqual(senderColor('abc'), senderColor('xyz'));
  assert.match(senderColor('abc'), /^hsl\(/);
});

test('upsert ignores a duplicate and updates it in place', () => {
  const base = [msg('1', 'a', '2026-11-28T10:00:00')];
  assert.equal(upsertMessage(base, msg('1', 'a', '2026-11-28T10:00:00')).length, 1);
  assert.equal(upsertMessage(base, msg('2', 'b', '2026-11-28T10:01:00')).length, 2);
});

test('deleting a message blanks it and any reply quoting it', () => {
  const list = [msg('1', 'a', '2026-11-28T10:00:00', { reactions: [{ kind: 'like', userIds: ['b'] }] }), msg('2', 'b', '2026-11-28T10:01:00', { replyTo: { id: '1', content: 'text 1', deleted: false } })];
  const out = markDeleted(list, '1');
  assert.equal(out[0].deleted, true);
  assert.equal(out[0].content, '');
  assert.deepEqual(out[0].reactions, []);
  assert.equal(out[1].replyTo.deleted, true);
  assert.equal(out[1].replyTo.content, '');
});

test('reactions: counts, mine, and my choice', () => {
  const r = [{ kind: 'like', userIds: ['me', 'x'] }, { kind: 'love', userIds: ['y'] }];
  assert.deepEqual(reactionSummary(r, 'me'), [{ kind: 'like', count: 2, mine: true }, { kind: 'love', count: 1, mine: false }]);
  assert.equal(myReaction(r, 'me'), 'like');
  assert.equal(myReaction(r, 'nobody'), null);
  assert.deepEqual(setReactions([msg('1', 'a', '2026-11-28T10:00:00')], '1', r)[0].reactions, r);
});

test('room list preview names the sender, says "You", and handles deleted and empty', () => {
  assert.equal(previewText(null, 'me'), 'No messages yet');
  assert.equal(previewText({ deleted: true }, 'me'), 'This message was deleted');
  assert.equal(previewText(msg('1', 'me', '2026-11-28T10:00:00'), 'me'), 'You: text 1');
  assert.equal(previewText(msg('1', 'ben', '2026-11-28T10:00:00'), 'me'), 'BEN: text 1');
});

test('typing text for one, two and many people', () => {
  assert.equal(typingText([]), '');
  assert.equal(typingText(['Ben']), 'Ben is typing…');
  assert.equal(typingText(['Ben', 'Asha']), 'Ben and Asha are typing…');
  assert.equal(typingText(['a', 'b', 'c']), '3 people are typing…');
  assert.equal(initials(' asha'), 'A');
});

test('only teachers and admins get a role label', () => {
  assert.equal(roleTag('TEACHER'), 'Teacher');
  assert.equal(roleTag('ADMIN'), 'Admin');
  assert.equal(roleTag('USER'), null);
  assert.equal(roleTag(undefined), null);
});

test('file sizes read naturally', () => {
  assert.equal(formatSize(512), '512 B');
  assert.equal(formatSize(1536), '1.5 KB');
  assert.equal(formatSize(2 * 1024 * 1024), '2 MB');
  assert.equal(formatSize(-1), '');
});

test('a file is checked before it is sent: type, size, empty', () => {
  assert.equal(attachProblem(null), null);
  assert.equal(attachProblem({ type: 'image/png', size: 1000 }), null);
  assert.equal(attachProblem({ type: 'application/pdf', size: 2 * 1024 * 1024 }), null);
  assert.match(attachProblem({ type: 'image/svg+xml', size: 10 }), /Only images/);
  assert.match(attachProblem({ type: 'image/png', size: 3 * 1024 * 1024 }), /limit is 2 MB/);
  assert.match(attachProblem({ type: 'image/png', size: 0 }), /empty/);
});

test('the room list names a picture or a file when the message has no text', () => {
  const m = { user: { id: 'b', username: 'Ben' }, content: '', deleted: false };
  assert.equal(previewText({ ...m, attachment: { isImage: true, name: 'x.png' } }, 'me'), 'Ben: Photo');
  assert.equal(previewText({ ...m, attachment: { isImage: false, name: 'notes.pdf' } }, 'me'), 'Ben: notes.pdf');
  assert.equal(previewText({ ...m, content: 'look', attachment: { isImage: true, name: 'x.png' } }, 'me'), 'Ben: look');
});
