// src/sockets/presenceRegistry.js
// Who is in which classroom, counted per PERSON, not per socket. A student with the class open on a phone
// and a laptop is one attendee, is only counted once, and "leaves" only when the last device leaves.
// Pure in-memory logic with an injectable clock, so it is unit-tested without sockets or a database.
'use strict';

class PresenceRegistry {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.classes = new Map(); // classId -> Map<userId, { username, sockets:Set, since:number, flushedAt:number }>
  }

  _room(classId) {
    if (!this.classes.has(classId)) this.classes.set(classId, new Map());
    return this.classes.get(classId);
  }

  // -> { first }  first=true when this is the person's first device in the class (count attendance once).
  join(classId, user, socketId) {
    const room = this._room(classId);
    let entry = room.get(user.id);
    const first = !entry;
    if (!entry) {
      const t = this.now();
      entry = { username: user.username, sockets: new Set(), since: t, flushedAt: t };
      room.set(user.id, entry);
    }
    entry.sockets.add(socketId);
    entry.username = user.username;
    return { first };
  }

  // -> { last, seconds }  seconds = time not yet counted (since the last flush) when the last device leaves.
  leave(classId, userId, socketId) {
    const room = this.classes.get(classId);
    const entry = room && room.get(userId);
    if (!entry || !entry.sockets.has(socketId)) return { last: false, seconds: 0 };
    entry.sockets.delete(socketId);
    if (entry.sockets.size > 0) return { last: false, seconds: 0 };
    const seconds = Math.max(0, Math.round((this.now() - entry.flushedAt) / 1000));
    room.delete(userId);
    if (room.size === 0) this.classes.delete(classId);
    return { last: true, seconds };
  }

  // Every class this socket was in (used on disconnect).
  classesOfSocket(socketId, userId) {
    const out = [];
    this.classes.forEach((room, classId) => { const e = room.get(userId); if (e && e.sockets.has(socketId)) out.push(classId); });
    return out;
  }

  has(classId, userId) { const room = this.classes.get(classId); return Boolean(room && room.has(userId)); }
  count(classId) { const room = this.classes.get(classId); return room ? room.size : 0; }
  users(classId) { const room = this.classes.get(classId); return room ? [...room.entries()].map(([userId, e]) => ({ userId, username: e.username })) : []; }

  // Seconds each present person has been online since the last flush; resets the marker. Called every minute so a
  // server restart loses at most a minute of attendance.
  flush(classId) {
    const room = this.classes.get(classId);
    if (!room) return [];
    const t = this.now();
    return [...room.entries()].map(([userId, e]) => {
      const seconds = Math.max(0, Math.round((t - e.flushedAt) / 1000));
      e.flushedAt = t;
      return { userId, seconds };
    }).filter((x) => x.seconds > 0);
  }
  activeClassIds() { return [...this.classes.keys()]; }

  // The class ended: return what is left to count, and forget it.
  // Everyone present is returned, even with 0 seconds, so each of them gets a departure time.
  end(classId) {
    const room = this.classes.get(classId);
    if (!room) return [];
    const t = this.now();
    const result = [...room.entries()].map(([userId, e]) => ({ userId, seconds: Math.max(0, Math.round((t - e.flushedAt) / 1000)) }));
    this.classes.delete(classId);
    return result;
  }
}

module.exports = { PresenceRegistry };
