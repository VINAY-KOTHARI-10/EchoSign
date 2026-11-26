// The WebRTC side of Sign Meet: one direct connection to each other person in the meeting.
//
// The server (Socket.IO) only carries the connection messages; the video and audio travel straight between the devices.
// Everything the browser provides is injected (`createConnection`, `send`), so the rules below are tested without a
// browser. The person who joins last makes the offers; people already in the meeting wait to be called. Connection
// candidates that arrive before the other side's description are held until they can be used.

export function createMesh({ createConnection, send, getLocalStream, onRemoteStream, onPeerGone, onPeerState }) {
  const peers = new Map(); // peerId -> { pc, pending: [], remoteSet: false, closed: false }

  const make = (peerId) => {
    const existing = peers.get(peerId);
    if (existing && !existing.closed) return existing;
    const pc = createConnection();
    const entry = { pc, pending: [], remoteSet: false, closed: false };
    peers.set(peerId, entry);

    const local = getLocalStream();
    if (local) local.getTracks().forEach((t) => pc.addTrack(t, local));

    pc.onicecandidate = (e) => { if (e && e.candidate && !entry.closed) send(peerId, { candidate: e.candidate }); };
    pc.ontrack = (e) => { if (e && e.streams && e.streams[0] && !entry.closed) onRemoteStream(peerId, e.streams[0]); };
    pc.onconnectionstatechange = () => {
      if (entry.closed) return;
      onPeerState?.(peerId, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') remove(peerId);
    };
    return entry;
  };

  // Someone is already here when we arrive: call them.
  async function callPeer(peerId) {
    const entry = make(peerId);
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    send(peerId, { description: entry.pc.localDescription });
  }

  // Someone arrived after us: get ready; their offer will come.
  function expectPeer(peerId) { make(peerId); }

  async function handleSignal(from, data) {
    if (!data || typeof data !== 'object') return;
    const entry = make(from);
    if (entry.closed) return;
    if (data.description) {
      await entry.pc.setRemoteDescription(data.description);
      entry.remoteSet = true;
      if (data.description.type === 'offer') {
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        send(from, { description: entry.pc.localDescription });
      }
      const waiting = entry.pending.splice(0);
      for (const c of waiting) await entry.pc.addIceCandidate(c);
    } else if (data.candidate) {
      if (!entry.remoteSet) entry.pending.push(data.candidate);
      else await entry.pc.addIceCandidate(data.candidate);
    }
  }

  function remove(peerId) {
    const entry = peers.get(peerId);
    if (!entry || entry.closed) return;
    entry.closed = true;
    peers.delete(peerId);
    try { entry.pc.close(); } catch { /* already closed */ }
    onPeerGone(peerId);
  }

  // The camera or microphone was switched to a different stream: give every connection the new tracks.
  function replaceLocalStream(stream) {
    peers.forEach(({ pc }) => {
      const senders = pc.getSenders ? pc.getSenders() : [];
      (stream ? stream.getTracks() : []).forEach((track) => {
        const sender = senders.find((s) => s.track && s.track.kind === track.kind);
        if (sender) sender.replaceTrack(track).catch(() => {});
        else pc.addTrack(track, stream);
      });
    });
  }

  function closeAll() { [...peers.keys()].forEach(remove); }

  return { callPeer, expectPeer, handleSignal, remove, replaceLocalStream, closeAll, size: () => peers.size, has: (id) => peers.has(id) };
}

// The default connection settings. With no ICE servers the devices find each other directly (a hotspot or local
// network); servers are only added when the meeting server was configured with them.
export const connectionFactory = (iceServers = []) => () => new RTCPeerConnection({ iceServers });
