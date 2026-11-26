'use strict';
const { MeetRooms, iceServersFromEnv, MAX_PEOPLE, ROOM_CODE } = require('../src/sockets/meetManager');

const person = (id) => ({ socketId: `s${id}`, userId: `u${id}`, username: `user${id}` });

describe('Sign Meet rooms', () => {
  it('accepts only six-character codes of letters and numbers', () => {
    const r = new MeetRooms();
    ['', 'abc', 'ABCDE', 'ABCDEFG', 'ABC 12', 'ABC!23', null, undefined].forEach((c) => expect(r.join(c, person(1)).code).toBe('BAD_CODE'));
    expect(ROOM_CODE.test('K7M2QX')).toBe(true);
    expect(r.join('K7M2QX', person(1)).ok).toBe(true);
  });

  it('tells a newcomer who is already there, and nobody else is told twice', () => {
    const r = new MeetRooms();
    expect(r.join('K7M2QX', person(1)).peers).toEqual([]);
    const second = r.join('K7M2QX', person(2));
    expect(second.peers.map((p) => p.socketId)).toEqual(['s1']);
    expect(r.size('K7M2QX')).toBe(2);
  });

  it('holds at most four people', () => {
    const r = new MeetRooms();
    for (let i = 1; i <= MAX_PEOPLE; i += 1) expect(r.join('K7M2QX', person(i)).ok).toBe(true);
    const fifth = r.join('K7M2QX', person(9));
    expect(fifth.ok).toBe(false);
    expect(fifth.code).toBe('ROOM_FULL');
    expect(r.size('K7M2QX')).toBe(MAX_PEOPLE);
  });

  it('one connection cannot be in two meetings at once', () => {
    const r = new MeetRooms();
    r.join('K7M2QX', person(1));
    expect(r.join('ZZZZ22', person(1)).code).toBe('ALREADY_IN_ROOM');
  });

  it('only people in the same room can reach each other', () => {
    const r = new MeetRooms();
    r.join('K7M2QX', person(1)); r.join('K7M2QX', person(2)); r.join('ZZZZ22', person(3));
    expect(r.sameRoom('s1', 's2')).toBe(true);
    expect(r.sameRoom('s1', 's3')).toBe(false);
    expect(r.sameRoom('s1', 'stranger')).toBe(false);
    expect(r.sameRoom('nobody', 'nobody2')).toBe(false);
  });

  it('leaving frees the seat, reports who is left, and an empty room disappears', () => {
    const r = new MeetRooms();
    r.join('K7M2QX', person(1)); r.join('K7M2QX', person(2));
    expect(r.leave('s1')).toEqual({ code: 'K7M2QX', remaining: ['s2'] });
    expect(r.join('K7M2QX', person(3)).ok).toBe(true);
    r.leave('s2'); r.leave('s3');
    expect(r.size('K7M2QX')).toBe(0);
    expect(r.rooms.has('K7M2QX')).toBe(false);
    expect(r.leave('s1')).toBeNull();
  });

  it('lists the others in a room without the asker', () => {
    const r = new MeetRooms();
    r.join('K7M2QX', person(1)); r.join('K7M2QX', person(2)); r.join('K7M2QX', person(3));
    expect(r.othersIn('K7M2QX', 's2').sort()).toEqual(['s1', 's3']);
  });
});

describe('ICE servers', () => {
  it('are empty by default, so a hotspot meeting contacts nobody outside', () => {
    expect(iceServersFromEnv(undefined)).toEqual([]);
    expect(iceServersFromEnv('')).toEqual([]);
  });

  it('can be set for meetings across the internet, and bad settings are ignored', () => {
    expect(iceServersFromEnv('[{"urls":"stun:stun.example.org:3478"}]')).toEqual([{ urls: 'stun:stun.example.org:3478' }]);
    expect(iceServersFromEnv('not json')).toEqual([]);
    expect(iceServersFromEnv('{"urls":"x"}')).toEqual([]);
    expect(iceServersFromEnv('[{"nope":1},{"urls":["turn:t.example.org"],"username":"u","credential":"c"}]')).toHaveLength(1);
  });
});
