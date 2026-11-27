// src/utils/chatShape.js
// How a community chat message is sent to the browser: one shape for the REST API and the sockets.
//   * a deleted message keeps its place but loses its text ("This message was deleted")
//   * a reply carries a short quote of the message it answers
//   * reactions are grouped by kind with the ids of the people who chose it (the browser works out "mine" and the counts)
'use strict';

// The choices in the reaction bar. The browser draws an icon for each; the server only accepts these words.
const REACTION_KINDS = ['like', 'love', 'laugh', 'wow', 'thanks'];

const MESSAGE_INCLUDE = {
  user: { select: { id: true, username: true, role: true } },
  attachment: { select: { id: true, name: true, mime: true, size: true } },
  replyTo: { select: { id: true, content: true, deletedAt: true, user: { select: { id: true, username: true } }, attachment: { select: { name: true, mime: true } } } },
  reactions: { select: { kind: true, userId: true } },
};

const groupReactions = (rows) => {
  const byKind = new Map();
  (rows || []).forEach((r) => {
    if (!REACTION_KINDS.includes(r.kind)) return;
    if (!byKind.has(r.kind)) byKind.set(r.kind, { kind: r.kind, userIds: [] });
    byKind.get(r.kind).userIds.push(r.userId);
  });
  return REACTION_KINDS.filter((k) => byKind.has(k)).map((k) => byKind.get(k));
};

const quote = (text, max = 140) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const shapeMessage = (m) => ({
  id: m.id,
  roomId: m.roomId,
  content: m.deletedAt ? '' : m.content,
  deleted: Boolean(m.deletedAt),
  createdAt: m.createdAt,
  user: m.user,
  attachment: m.deletedAt || !m.attachment ? null : { id: m.attachment.id, name: m.attachment.name, mime: m.attachment.mime, size: m.attachment.size, isImage: m.attachment.mime.startsWith('image/') },
  replyTo: m.replyTo
    ? { id: m.replyTo.id, content: m.replyTo.deletedAt ? '' : quote(m.replyTo.content), deleted: Boolean(m.replyTo.deletedAt), user: m.replyTo.user, attachmentLabel: !m.replyTo.deletedAt && m.replyTo.attachment ? (m.replyTo.attachment.mime.startsWith('image/') ? 'Photo' : m.replyTo.attachment.name) : null }
    : null,
  reactions: groupReactions(m.reactions),
});

module.exports = { REACTION_KINDS, MESSAGE_INCLUDE, groupReactions, shapeMessage };
