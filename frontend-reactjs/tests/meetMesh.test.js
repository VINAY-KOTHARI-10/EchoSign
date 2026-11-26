import test from 'node:test';
import assert from 'node:assert/strict';
import { createMesh } from '../src/lib/meet/mesh.js';

// A fake browser connection that records what happens to it.
function fakeConnection() {
  const pc = {
    tracks: [], added: [], remote: null, local: null, closed: false, replaced: [],
    addTrack(t) { this.tracks.push(t); },
    async createOffer() { return { type: 'offer', sdp: 'offer' }; },
    async createAnswer() { return { type: 'answer', sdp: 'answer' }; },
    async setLocalDescription(d) { this.local = d; this.localDescription = d; },
    async setRemoteDescription(d) { this.remote = d; },
    async addIceCandidate(c) { if (!this.remote) throw new Error('candidate before description'); this.added.push(c); },
    getSenders() { return this.tracks.map((t) => ({ track: t, replaceTrack: async (n) => { pc.replaced.push([t.kind, n.kind]); } })); },
    close() { this.closed = true; },
  };
  return pc;
}

function setup(localTracks = [{ kind: 'video' }, { kind: 'audio' }]) {
  const conns = []; const sent = []; const streams = []; const gone = []; const states = [];
  const stream = { getTracks: () => localTracks };
  const mesh = createMesh({
    createConnection: () => { const c = fakeConnection(); conns.push(c); return c; },
    send: (to, data) => sent.push([to, data]),
    getLocalStream: () => stream,
    onRemoteStream: (id, s) => streams.push([id, s]),
    onPeerGone: (id) => gone.push(id),
    onPeerState: (id, s) => states.push([id, s]),
  });
  return { mesh, conns, sent, streams, gone, states, stream };
}

test('the newcomer calls the people already there: an offer goes to each, carrying our camera and microphone', async () => {
  const { mesh, conns, sent } = setup();
  await mesh.callPeer('a');
  await mesh.callPeer('b');
  assert.equal(conns.length, 2);
  assert.deepEqual(conns[0].tracks.map((t) => t.kind), ['video', 'audio']);
  assert.deepEqual(sent.map(([to, d]) => [to, d.description.type]), [['a', 'offer'], ['b', 'offer']]);
});

test('people already there wait: they make no offer, then answer the newcomer\'s', async () => {
  const { mesh, sent, conns } = setup();
  mesh.expectPeer('new');
  assert.equal(sent.length, 0, 'no offer from the one who was already here');
  await mesh.handleSignal('new', { description: { type: 'offer', sdp: 'x' } });
  assert.deepEqual(sent.map(([to, d]) => [to, d.description.type]), [['new', 'answer']]);
  assert.equal(conns.length, 1, 'the connection prepared earlier is reused');
});

test('connection candidates that arrive before the description are held, then applied in order', async () => {
  const { mesh, conns } = setup();
  mesh.expectPeer('p');
  await mesh.handleSignal('p', { candidate: { c: 1 } });
  await mesh.handleSignal('p', { candidate: { c: 2 } });
  assert.equal(conns[0].added.length, 0, 'not applied yet');
  await mesh.handleSignal('p', { description: { type: 'offer', sdp: 'x' } });
  assert.deepEqual(conns[0].added, [{ c: 1 }, { c: 2 }]);
  await mesh.handleSignal('p', { candidate: { c: 3 } });
  assert.equal(conns[0].added.length, 3, 'later candidates are applied at once');
});

test('our own candidates are sent to the right person', async () => {
  const { mesh, conns, sent } = setup();
  await mesh.callPeer('a');
  conns[0].onicecandidate({ candidate: { c: 'mine' } });
  conns[0].onicecandidate({ candidate: null });
  assert.deepEqual(sent.filter(([, d]) => d.candidate).map(([to, d]) => [to, d.candidate]), [['a', { c: 'mine' }]]);
});

test('a remote stream is reported once it arrives', async () => {
  const { mesh, conns, streams } = setup();
  await mesh.callPeer('a');
  const s = { id: 'remote' };
  conns[0].ontrack({ streams: [s] });
  assert.deepEqual(streams, [['a', s]]);
});

test('a failed or closed connection removes that person; the others stay', async () => {
  const { mesh, conns, gone, states } = setup();
  await mesh.callPeer('a'); await mesh.callPeer('b');
  conns[0].connectionState = 'failed'; conns[0].onconnectionstatechange();
  assert.deepEqual(gone, ['a']);
  assert.equal(conns[0].closed, true);
  assert.equal(mesh.has('a'), false);
  assert.equal(mesh.has('b'), true);
  assert.deepEqual(states[0], ['a', 'failed']);
});

test('removing someone twice, or messages from a stranger who left, do nothing harmful', async () => {
  const { mesh, gone } = setup();
  await mesh.callPeer('a');
  mesh.remove('a'); mesh.remove('a');
  assert.deepEqual(gone, ['a']);
  await assert.doesNotReject(mesh.handleSignal('a', null));
  await assert.doesNotReject(mesh.handleSignal('a', 'junk'));
});

test('leaving closes every connection', async () => {
  const { mesh, conns, gone } = setup();
  await mesh.callPeer('a'); await mesh.callPeer('b'); await mesh.callPeer('c');
  mesh.closeAll();
  assert.ok(conns.every((c) => c.closed));
  assert.deepEqual(gone.sort(), ['a', 'b', 'c']);
  assert.equal(mesh.size(), 0);
});

test('switching camera or microphone gives each connection the new track', async () => {
  const { mesh, conns } = setup();
  await mesh.callPeer('a');
  mesh.replaceLocalStream({ getTracks: () => [{ kind: 'video' }] });
  assert.deepEqual(conns[0].replaced, [['video', 'video']]);
});
