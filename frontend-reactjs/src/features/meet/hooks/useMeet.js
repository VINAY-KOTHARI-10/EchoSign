import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL, getToken } from '../../../api/client';
import { cameraMessage } from '../../../lib/signSession';
import { connectionFactory, createMesh } from '../../../lib/meet/mesh';
import { addLine } from '../../../lib/meet/subtitles';

// One Sign Meet session: your camera and microphone, a direct connection to each other person, and the subtitles that
// travel alongside. The server only introduces people and passes connection messages; video and audio go straight
// between the devices (so on a hotspot they never leave it).
export default function useMeet() {
  const [status, setStatus] = useState('idle');      // idle | starting | joined | error
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState({});            // socketId -> { username, stream, state }
  const [lines, setLines] = useState([]);            // the subtitle log, newest last
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const ref = useRef({ socket: null, mesh: null, stream: null, me: null, seq: 0, left: false });

  const addPeer = useCallback((p) => setPeers((cur) => ({ ...cur, [p.socketId]: { ...(cur[p.socketId] || {}), username: p.username, state: cur[p.socketId]?.state || 'connecting' } })), []);
  const note = useCallback((who, text, kind, mine = false) => {
    ref.current.seq += 1;
    setLines((cur) => addLine(cur, { id: ref.current.seq, who, text, kind, mine, at: Date.now() }));
  }, []);

  const cleanup = useCallback(() => {
    const r = ref.current;
    r.left = true;
    try { r.socket?.emit('meet:leave'); } catch { /* socket already gone */ }
    r.mesh?.closeAll();
    r.socket?.close();
    r.stream?.getTracks().forEach((t) => t.stop());
    ref.current = { socket: null, mesh: null, stream: null, me: null, seq: 0, left: false };
    setLocalStream(null); setPeers({}); setLines([]); setMicOn(true); setCamOn(true);
  }, []);

  const leave = useCallback(() => { cleanup(); setStatus('idle'); setError(''); setCode(''); }, [cleanup]);

  const fail = useCallback((message) => { cleanup(); setStatus('error'); setError(message); }, [cleanup]);

  const join = useCallback(async (roomCode) => {
    if (ref.current.socket || status === 'starting') return;
    const clean = String(roomCode || '').toUpperCase().trim();
    setStatus('starting'); setError(''); setCode(clean);
    ref.current.left = false;

    // Camera and microphone are asked for together. If that fails (for example, no microphone is plugged in), carry on
    // with whatever works, so the meeting still starts and the person can at least see and be seen, or hear and speak.
    let stream;
    let firstError = null;
    const attempts = [
      { video: { width: 640, height: 480, facingMode: 'user' }, audio: true },
      { video: { width: 640, height: 480, facingMode: 'user' }, audio: false },
      { video: false, audio: true },
    ];
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('error'); setError(cameraMessage(null, window.isSecureContext)); return;
    }
    for (const constraints of attempts) {
      try { stream = await navigator.mediaDevices.getUserMedia(constraints); break; } catch (err) {
        firstError = firstError || err;
        if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) break; // blocked: the other tries would be blocked too
      }
    }
    if (!stream) { setStatus('error'); setError(cameraMessage(firstError, window.isSecureContext)); return; }
    ref.current.stream = stream; setLocalStream(stream);

    const socket = io(SOCKET_URL, { auth: (cb) => cb({ token: getToken() }), withCredentials: true, reconnection: false });
    ref.current.socket = socket;

    socket.on('connect_error', (e) => fail(/authentication/i.test(e.message) ? 'Please sign in again.' : /busy/i.test(e.message) ? 'The server is busy right now. Please try again in a moment.' : 'Could not reach the meeting server. Check the address and that you are on the same network.'));
    socket.on('disconnect', () => { if (!ref.current.left) fail('The connection to the meeting was lost.'); });

    socket.on('connect', () => {
      socket.emit('meet:join', { code: clean }, (res) => {
        if (!res || !res.ok) { fail((res && res.error) || 'Could not join the meeting.'); return; }
        ref.current.me = res.you;
        const mesh = createMesh({
          createConnection: connectionFactory(res.iceServers || []),
          send: (to, data) => socket.emit('meet:signal', { to, data }),
          getLocalStream: () => ref.current.stream,
          onRemoteStream: (id, s) => setPeers((cur) => ({ ...cur, [id]: { ...(cur[id] || {}), stream: s } })),
          onPeerGone: (id) => setPeers((cur) => { const next = { ...cur }; delete next[id]; return next; }),
          onPeerState: (id, s) => setPeers((cur) => (cur[id] ? { ...cur, [id]: { ...cur[id], state: s } } : cur)),
        });
        ref.current.mesh = mesh;
        res.peers.forEach((p) => { addPeer(p); mesh.callPeer(p.socketId).catch(() => {}); });
        setStatus('joined');
      });
    });

    socket.on('meet:peer-joined', ({ peer }) => { addPeer(peer); ref.current.mesh?.expectPeer(peer.socketId); note(peer.username, 'joined the meeting', 'system'); });
    socket.on('meet:peer-left', ({ socketId }) => {
      setPeers((cur) => { if (cur[socketId]) note(cur[socketId].username, 'left the meeting', 'system'); return cur; });
      ref.current.mesh?.remove(socketId);
    });
    socket.on('meet:signal', ({ from, data }) => { ref.current.mesh?.handleSignal(from, data).catch(() => {}); });
    socket.on('meet:subtitle', (s) => note(s.username, s.text, s.kind));
  }, [status, addPeer, fail, note]);

  // Say something to everyone: shown in your own log at once, and sent to the others.
  const say = useCallback((text, kind) => {
    const clean = String(text || '').trim();
    if (!clean || !ref.current.socket) return;
    ref.current.socket.emit('meet:subtitle', { text: clean, kind });
    note('You', clean, kind, true);
  }, [note]);

  const toggleMic = useCallback(() => {
    const t = ref.current.stream?.getAudioTracks()[0]; if (!t) return;
    t.enabled = !t.enabled; setMicOn(t.enabled);
  }, []);
  const toggleCam = useCallback(() => {
    const t = ref.current.stream?.getVideoTracks()[0]; if (!t) return;
    t.enabled = !t.enabled; setCamOn(t.enabled);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  return { status, error, code, localStream, peers, lines, micOn, camOn, join, leave, say, toggleMic, toggleCam };
}
