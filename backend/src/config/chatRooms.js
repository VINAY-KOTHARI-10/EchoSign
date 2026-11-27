// src/config/chatRooms.js
// Community chat rooms: one General room, plus one room for every language that is switched on (the Languages admin page
// controls the list). Add a language and its room appears; switch it off and the room is hidden (its messages are kept).
// Sockets and the REST API both refuse any room that is not listed here, so nobody can invent a room name and read or write
// somewhere they should not.
'use strict';

const { prisma } = require('./postgres');
const { activeLanguages } = require('./languages');

// The four rooms that existed before languages could be added keep their old ids, so their messages stay where they were.
const LEGACY = { en: 'english', es: 'spanish', fr: 'french', ja: 'japanese' };
const roomIdFor = (code) => LEGACY[code] || `lang-${code}`;

const roomsFor = (languages) => [
  { id: 'global', code: null, label: 'General', desc: 'Everyone is welcome' },
  ...languages.map((l) => ({ id: roomIdFor(l.code), code: l.code, label: `${l.name} learners`, desc: `${l.name} practice` })),
];

async function chatRooms() {
  return roomsFor(await activeLanguages(prisma));
}

async function isChatRoom(id) {
  return typeof id === 'string' && (await chatRooms()).some((r) => r.id === id);
}

module.exports = { chatRooms, isChatRoom, roomIdFor, roomsFor };
