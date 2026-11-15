// src/config/chatRooms.js
// Community chat rooms. Sockets and the REST API both refuse any room that is not listed here,
// so nobody can invent a room name and read or write somewhere they should not.
'use strict';

const CHAT_ROOMS = ['global', 'english', 'spanish', 'french', 'japanese'];
const isChatRoom = (id) => CHAT_ROOMS.includes(id);

module.exports = { CHAT_ROOMS, isChatRoom };
