// Pure helpers for the Community chat (no React, no sockets), so they are tested.

export const REACTIONS = ['like', 'love', 'laugh', 'wow', 'thanks'];
export const REACTION_LABEL = { like: 'Like', love: 'Love', laugh: 'Funny', wow: 'Wow', thanks: 'Thanks' };

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };

/** "Today", "Yesterday", the weekday for the last week, otherwise the date. */
export function dayLabel(date, now = new Date()) {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const d = new Date(date);
  if (days < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

const sameDay = (a, b) => startOfDay(a) === startOfDay(b);

/**
 * messages -> a flat list for rendering: a day divider whenever the day changes, then each message with `first` set
 * when it starts a run from the same person (only the first message of a run shows the sender's name).
 */
export function layoutMessages(messages, now = new Date()) {
  const out = [];
  let prev = null;
  messages.forEach((msg) => {
    if (!prev || !sameDay(prev.createdAt, msg.createdAt)) out.push({ type: 'day', key: `day-${startOfDay(msg.createdAt)}`, label: dayLabel(msg.createdAt, now) });
    const first = !prev || !sameDay(prev.createdAt, msg.createdAt) || prev.user?.id !== msg.user?.id || new Date(msg.createdAt) - new Date(prev.createdAt) > 5 * 60000;
    out.push({ type: 'msg', key: msg.id, msg, first });
    prev = msg;
  });
  return out;
}

/** A steady colour for each person's name (readable on a white bubble). */
export function senderColor(id = '') {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 36%)`;
}

/** Adds a message, ignoring one that is already there (a message can arrive over the socket and from a reload). */
export const upsertMessage = (list, msg) => (list.some((m) => m.id === msg.id) ? list.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)) : [...list, msg]);

/** A deleted message loses its text; replies that quote it show "deleted" too. */
export const markDeleted = (list, id) => list.map((m) => {
  if (m.id === id) return { ...m, deleted: true, content: '', reactions: [] };
  if (m.replyTo?.id === id) return { ...m, replyTo: { ...m.replyTo, deleted: true, content: '' } };
  return m;
});

export const setReactions = (list, id, reactions) => list.map((m) => (m.id === id ? { ...m, reactions } : m));

/** [{kind, userIds}] -> [{kind, count, mine}] for the pills under a message. */
export const reactionSummary = (reactions = [], meId) => reactions.map((r) => ({ kind: r.kind, count: r.userIds.length, mine: r.userIds.includes(meId) }));

/** The kind this person chose on a message, or null. */
export const myReaction = (reactions = [], meId) => reactions.find((r) => r.userIds.includes(meId))?.kind ?? null;

/** One line for the room list: "Ben: see you there", "You: hello", or the deleted notice. */
export function previewText(msg, meId) {
  if (!msg) return 'No messages yet';
  if (msg.deleted) return 'This message was deleted';
  const who = msg.user?.id === meId ? 'You' : msg.user?.username;
  if (!msg.content && msg.attachment) return `${who}: ${msg.attachment.isImage ? 'Photo' : msg.attachment.name}`;
  return `${who}: ${msg.content}`;
}

/** Only teachers and administrators carry a role label next to their name. */
export const roleTag = (role) => (role === 'ADMIN' ? 'Admin' : role === 'TEACHER' ? 'Teacher' : null);

/** 1536 -> "1.5 KB", 2097152 -> "2 MB". */
export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round((bytes / 1024) * 10) / 10} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

export const ATTACH_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
export const ATTACH_MAX = 2 * 1024 * 1024;

/** A message for the person if the chosen file cannot be sent, otherwise null. */
export function attachProblem(file) {
  if (!file) return null;
  if (!ATTACH_TYPES.includes(file.type)) return 'Only images (PNG, JPG, GIF, WebP) and PDFs can be sent.';
  if (file.size > ATTACH_MAX) return `That file is ${formatSize(file.size)}. The limit is 2 MB.`;
  if (file.size === 0) return 'That file is empty.';
  return null;
}

/** Initials for a round avatar. */
export const initials = (name = '?') => name.trim().slice(0, 1).toUpperCase() || '?';

/** Who is typing, as a sentence: "Ben is typing…", "Ben and Asha are typing…", "3 people are typing…". */
export function typingText(names) {
  if (!names.length) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.length} people are typing…`;
}
