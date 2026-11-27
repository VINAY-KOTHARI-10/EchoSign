'use strict';
const { REACTION_KINDS, groupReactions, shapeMessage } = require('../src/utils/chatShape');

const base = {
  id: 'm1', roomId: 'global', content: 'Hello everyone', createdAt: new Date('2026-11-28T10:00:00Z'), deletedAt: null,
  user: { id: 'u1', username: 'Asha' }, replyTo: null, reactions: [],
};

describe('community chat message shape', () => {
  test('a normal message passes through with its text', () => {
    const m = shapeMessage(base);
    expect(m.content).toBe('Hello everyone');
    expect(m.deleted).toBe(false);
    expect(m.replyTo).toBeNull();
    expect(m.reactions).toEqual([]);
  });

  test('a deleted message keeps its place but loses its text', () => {
    const m = shapeMessage({ ...base, deletedAt: new Date(), content: 'secret' });
    expect(m.deleted).toBe(true);
    expect(m.content).toBe('');
  });

  test('a reply carries a short quote, and a deleted quote shows no text', () => {
    const long = 'x'.repeat(300);
    const r = shapeMessage({ ...base, replyTo: { id: 'm0', content: long, deletedAt: null, user: { id: 'u2', username: 'Ben' } } });
    expect(r.replyTo.user.username).toBe('Ben');
    expect(r.replyTo.content.length).toBeLessThanOrEqual(140);
    expect(r.replyTo.content.endsWith('…')).toBe(true);
    const gone = shapeMessage({ ...base, replyTo: { id: 'm0', content: 'old', deletedAt: new Date(), user: { id: 'u2', username: 'Ben' } } });
    expect(gone.replyTo.deleted).toBe(true);
    expect(gone.replyTo.content).toBe('');
  });

  test('reactions are grouped by kind in a fixed order with the people who chose them', () => {
    const g = groupReactions([
      { kind: 'love', userId: 'u1' }, { kind: 'like', userId: 'u2' }, { kind: 'like', userId: 'u3' }, { kind: 'bogus', userId: 'u4' },
    ]);
    expect(g.map((x) => x.kind)).toEqual(['like', 'love']);
    expect(g[0].userIds).toEqual(['u2', 'u3']);
    expect(REACTION_KINDS).toContain('thanks');
  });
});
