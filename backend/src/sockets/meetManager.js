// src/sockets/meetManager.js
// Sign Meet: small video meetings (up to four people) that work on a phone hotspot or any local network.
//
// The server only introduces people to each other and passes their connection messages along. The video and audio go
// directly between the devices (WebRTC), so on a hotspot they never leave the local network and need no internet.
// Nothing is stored: a room exists only while someone is in it, and subtitles are relayed, not recorded.
//
//   meet:join    { code }              ack { ok, you, peers[], iceServers }   (errors: BAD_CODE, ROOM_FULL, ALREADY_IN_ROOM)
//   meet:signal  { to, data }          relayed to that person only, and only if they are in the same room
//   meet:subtitle{ text, kind }        relayed to everyone else in the room
//   meet:leave   {}                    (also on disconnect)
//   server -> client: meet:peer-joined, meet:peer-left, meet:signal, meet:subtitle
'use strict';

const ROOM_CODE = /^[A-Z2-9]{6}$/;
const MAX_PEOPLE = 4;
const MAX_SIGNAL_BYTES = 16 * 1024;        // an SDP offer/answer or an ICE candidate is far smaller than this
const MAX_SUBTITLE_CHARS = 300;
const SUBTITLE_KINDS = ['speech', 'letter', 'phrase', 'typed'];

// Who is in which room. Pure data, no sockets, so the rules can be tested directly.
class MeetRooms {
  constructor(max = MAX_PEOPLE) {
    this.max = max;
    this.rooms = new Map();   // code -> Map(socketId -> member)
    this.where = new Map();   // socketId -> code
  }

  join(code, member) {
    if (!ROOM_CODE.test(String(code || ''))) return { ok: false, code: 'BAD_CODE', error: 'Use a meeting code of 6 letters and numbers.' };
    if (this.where.has(member.socketId)) return { ok: false, code: 'ALREADY_IN_ROOM', error: 'Leave the current meeting first.' };
    const room = this.rooms.get(code) || new Map();
    if (room.size >= this.max) return { ok: false, code: 'ROOM_FULL', error: `This meeting already has ${this.max} people.` };
    const peers = [...room.values()];
    room.set(member.socketId, member);
    this.rooms.set(code, room);
    this.where.set(member.socketId, code);
    return { ok: true, peers };
  }

  leave(socketId) {
    const code = this.where.get(socketId);
    if (!code) return null;
    this.where.delete(socketId);
    const room = this.rooms.get(code);
    room.delete(socketId);
    if (!room.size) this.rooms.delete(code);
    return { code, remaining: room.size ? [...room.keys()] : [] };
  }

  codeOf(socketId) { return this.where.get(socketId) || null; }

  sameRoom(a, b) { const c = this.where.get(a); return Boolean(c) && c === this.where.get(b); }

  othersIn(code, socketId) { return [...(this.rooms.get(code) || new Map()).keys()].filter((id) => id !== socketId); }

  size(code) { return (this.rooms.get(code) || new Map()).size; }
}

// ICE servers are empty by default: on a hotspot or LAN devices find each other directly, and nothing is sent to a
// third party. For meetings across the internet set WEBRTC_ICE_SERVERS to a JSON array (STUN/TURN servers).
function iceServersFromEnv(raw = process.env.WEBRTC_ICE_SERVERS) {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((s) => s && (typeof s.urls === 'string' || Array.isArray(s.urls))).slice(0, 6) : [];
  } catch { return []; }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// A simple limit per socket: at most `max` messages in any `windowMs`.
function makeLimiter(max = 150, windowMs = 10000) {
  let stamps = [];
  return () => {
    const now = Date.now();
    stamps = stamps.filter((t) => now - t < windowMs);
    if (stamps.length >= max) return false;
    stamps.push(now);
    return true;
  };
}

function attachMeet(io, socket, rooms, logger) {
  const { user } = socket;
  const allowed = makeLimiter();
  const me = () => ({ socketId: socket.id, userId: user.id, username: user.username });
  const roomKey = (code) => `meet:${code}`;

  const leave = () => {
    const left = rooms.leave(socket.id);
    if (!left) return;
    socket.leave(roomKey(left.code));
    socket.to(roomKey(left.code)).emit('meet:peer-left', { socketId: socket.id });
    logger?.info?.(`Meet: ${user.username} left ${left.code} (${left.remaining.length} still in)`);
  };

  socket.on('meet:join', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (!allowed()) return reply({ ok: false, code: 'RATE_LIMITED', error: 'Slow down a little.' });
    const code = isObj(payload) ? String(payload.code || '').toUpperCase().trim() : '';
    const joined = rooms.join(code, me());
    if (!joined.ok) return reply(joined);
    socket.join(roomKey(code));
    socket.to(roomKey(code)).emit('meet:peer-joined', { peer: me() });
    logger?.info?.(`Meet: ${user.username} joined ${code} (${rooms.size(code)} in the room)`);
    return reply({ ok: true, you: me(), peers: joined.peers, iceServers: iceServersFromEnv() });
  });

  // Connection messages (offer, answer, ICE candidates): to one person, in the same room, never anywhere else.
  socket.on('meet:signal', (payload) => {
    if (!allowed() || !isObj(payload) || typeof payload.to !== 'string' || !isObj(payload.data)) return;
    if (!rooms.sameRoom(socket.id, payload.to)) return;
    let size = 0;
    try { size = Buffer.byteLength(JSON.stringify(payload.data)); } catch { return; }
    if (size > MAX_SIGNAL_BYTES) return;
    io.to(payload.to).emit('meet:signal', { from: socket.id, data: payload.data });
  });

  socket.on('meet:subtitle', (payload) => {
    if (!allowed() || !isObj(payload)) return;
    const code = rooms.codeOf(socket.id);
    if (!code) return;
    const text = String(payload.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_SUBTITLE_CHARS);
    if (!text) return;
    const kind = SUBTITLE_KINDS.includes(payload.kind) ? payload.kind : 'typed';
    socket.to(roomKey(code)).emit('meet:subtitle', { from: socket.id, username: user.username, text, kind, at: Date.now() });
  });

  socket.on('meet:leave', leave);
  socket.on('disconnect', leave);
}

module.exports = { MeetRooms, attachMeet, iceServersFromEnv, ROOM_CODE, MAX_PEOPLE, MAX_SIGNAL_BYTES, SUBTITLE_KINDS };
