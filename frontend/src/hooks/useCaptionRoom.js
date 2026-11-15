import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import * as api from '../api';
import { SOCKET_URL, getToken, onTokenChange, refreshAccessToken } from '../api/client';
import { Outbox } from '../lib/outbox';

const byTime = (a, b) => new Date(a.createdAt) - new Date(b.createdAt) || (a.id < b.id ? -1 : 1);
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);

// Everything about one live classroom: the room record, captions, who is here, raised hands, and the socket used to
// send captions. Sending is reliable: each caption carries an id, waits for the server's acknowledgement, and is
// retried (over the socket, or HTTP when the socket is down) until it is stored exactly once.
// `onIncoming(caption)` fires for captions that arrive live (not history).
export default function useCaptionRoom(code, { userId, onIncoming, onNotice } = {}) {
  const [room, setRoom] = useState(null);
  const [meta, setMeta] = useState({ isHost: false, role: 'STUDENT', canModerate: false });
  const [captions, setCaptions] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [interim, setInterim] = useState(null);
  const [hands, setHands] = useState([]);
  const [participants, setParticipants] = useState([]);
  const lastSpeech = useRef({});
  const [, setTick] = useState(0);
  const [count, setCount] = useState(0);
  const [connection, setConnection] = useState('connecting'); // connecting | online | reconnecting | offline
  const [pending, setPending] = useState(0);                   // captions sent but not yet confirmed
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const joinedRef = useRef(false);
  const outbox = useRef(new Outbox(newId)); // captions waiting for the server to confirm them
  const captionsRef = useRef([]);
  const incomingRef = useRef(onIncoming);
  const noticeRef = useRef(onNotice);
  incomingRef.current = onIncoming;
  noticeRef.current = onNotice;
  captionsRef.current = captions;

  const applyMeta = (data) => setMeta({ isHost: data.isHost, role: data.role, canModerate: data.canModerate });

  // Add captions, keeping chronological order and never storing one twice.
  const merge = useCallback((incoming) => {
    if (!incoming.length) return;
    setCaptions((list) => {
      const known = new Set(list.map((c) => c.id));
      const fresh = incoming.filter((c) => !known.has(c.id));
      return fresh.length ? [...list, ...fresh].sort(byTime) : list;
    });
  }, []);

  // Load the classroom and the captions already spoken.
  useEffect(() => {
    let cancelled = false;
    setRoom(null); setCaptions([]); setError(''); setEnded(false); joinedRef.current = false;
    (async () => {
      try {
        const [r, c] = await Promise.all([api.classrooms.get(code), api.classrooms.captions(code).catch(() => null)]);
        if (cancelled) return;
        setRoom(r.data.classroom); applyMeta(r.data); setEnded(!r.data.classroom.active);
        // Someone who only has the code cannot read captions until they join; that is fine, the join below loads them.
        if (c) { setCaptions(c.data.captions); setHasMore(Boolean(c.data.hasMore)); }
      } catch (err) { if (!cancelled) setError(err.message); }
    })();
    return () => { cancelled = true; };
  }, [code]);

  const refreshMeta = useCallback(async () => {
    try { const r = await api.classrooms.get(code); setRoom(r.data.classroom); applyMeta(r.data); } catch { /* ignore */ }
  }, [code]);

  // ── Reliable sending ───────────────────────────────────────────────────────
  const settle = useCallback((clientId, caption) => {
    outbox.current.settle(clientId);
    setPending(outbox.current.size);
    if (caption) merge([caption]);
  }, [merge]);

  const fail = useCallback((clientId) => {
    if (outbox.current.fail(clientId) === 6) noticeRef.current?.('A caption is taking a while to send. It will keep retrying.', 'info');
  }, []);

  const flush = useCallback(() => {
    const socket = socketRef.current;
    outbox.current.due().forEach(([clientId, item]) => {
      if (socket?.connected && joinedRef.current) {
        socket.timeout(8000).emit('class:caption', { code, text: item.text, source: item.source, clientId }, (err, res) => {
          if (err || !res) return fail(clientId);
          if (res.ok) return settle(clientId, res.caption);
          if (res.retryable || res.code === 'NOT_JOINED') return fail(clientId);
          noticeRef.current?.(res.error || 'Caption was not accepted', 'error');
          return settle(clientId);
        });
      } else if (typeof navigator === 'undefined' || navigator.onLine) {
        // The live connection is down but the network is up: store it over HTTP with the same id.
        api.classrooms.postCaption(code, { text: item.text, source: item.source, clientId })
          .then((r) => settle(clientId, r.data.caption))
          .catch((e) => { if (e.status === 409 || e.status === 403) { noticeRef.current?.(e.message, 'error'); settle(clientId); } else fail(clientId); });
      } else { outbox.current.release(clientId); }
    });
  }, [code, fail, settle]);

  const sendCaption = useCallback((text, source) => {
    outbox.current.add(text, source);
    setPending(outbox.current.size);
    flush();
  }, [flush]);

  // ── Live connection while the class is running ─────────────────────────────
  const active = Boolean(room?.active) && !ended;
  const roomCode = room?.code;
  useEffect(() => {
    if (!active) return undefined;
    // `auth` as a function is evaluated on every (re)connect, so a long-lived page never reuses an expired token.
    const socket = io(SOCKET_URL, { auth: (cb) => cb({ token: getToken() }), withCredentials: true, reconnectionDelayMax: 5000 });
    socketRef.current = socket;

    const join = () => {
      const last = captionsRef.current[captionsRef.current.length - 1];
      socket.emit('class:join', { code: roomCode, sinceId: last?.id }, async (res) => {
        if (!res?.ok) {
          joinedRef.current = false;
          noticeRef.current?.(res?.error || 'Could not join', 'error');
          if (res?.code === 'ENDED') setEnded(true);
          return;
        }
        joinedRef.current = true;
        setConnection('online');
        setCount(res.count); setHands(res.hands || []); setParticipants(res.participants || []);
        setMeta((m) => ({ ...m, isHost: res.isHost, role: res.role || m.role, canModerate: res.canModerate }));
        // Catch up on anything said while we were away.
        if (res.resync) {
          try { const c = await api.classrooms.captions(roomCode); setCaptions(c.data.captions); setHasMore(Boolean(c.data.hasMore)); } catch { /* next reconnect retries */ }
        } else if (res.missed?.length) merge(res.missed);
        else if (!last) { try { const c = await api.classrooms.captions(roomCode); merge(c.data.captions); setHasMore(Boolean(c.data.hasMore)); } catch { /* ignore */ } }
        refreshMeta(); // now that we are a member, load custom gestures and notes
        flush();
      });
    };

    socket.on('connect', join);
    socket.on('disconnect', () => { joinedRef.current = false; setConnection((c) => (c === 'offline' ? c : 'reconnecting')); });
    socket.io.on('reconnect_attempt', () => setConnection((c) => (c === 'offline' ? c : 'reconnecting')));
    // If the server rejected an expired token, get a new one and try again.
    socket.on('connect_error', async (err) => {
      setConnection((c) => (c === 'offline' ? c : 'reconnecting'));
      if (/authentication/i.test(err.message) && (await refreshAccessToken())) setTimeout(() => socket.connect(), 500);
    });
    // Access tokens are short-lived: tell the server about each refreshed one, and answer if it asks.
    const sendToken = () => { if (socket.connected) socket.emit('auth:refresh', { token: getToken() }); };
    const offToken = onTokenChange(sendToken);
    socket.on('auth:expired', async () => { if (await refreshAccessToken()) sendToken(); });

    socket.on('class:presence', (p) => setCount(p.count));
    socket.on('class:interim', (i) => { if (i.source === 'SPEECH') lastSpeech.current[i.speakerId] = Date.now(); setInterim(i); });
    socket.on('class:participants', setParticipants);
    socket.on('class:hands', setHands);
    socket.on('class:caption', (cap) => {
      if (cap.source === 'SPEECH' && cap.speakerId) lastSpeech.current[cap.speakerId] = Date.now();
      merge([cap]);
      // Drop the speaker's draft line only if it was typed before this final caption.
      setInterim((cur) => (cur && cur.speakerId === cap.speakerId && cur.at <= new Date(cap.createdAt).getTime() ? null : cur));
      incomingRef.current?.(cap);
    });
    socket.on('class:caption:edited', (cap) => setCaptions((list) => list.map((c) => (c.id === cap.id ? cap : c))));
    socket.on('class:settings', (s) => setRoom((r) => (r ? { ...r, ...s } : r)));
    socket.on('class:role', (r) => {
      setParticipants((list) => list.map((p) => (p.userId === r.userId ? { ...p, role: r.role } : p)));
      if (r.userId === userId) refreshMeta();
    });
    socket.on('class:ended', () => { setEnded(true); setHands([]); noticeRef.current?.('The class has ended', 'info'); });
    socket.on('class:error', (e) => noticeRef.current?.(e.message, 'error'));

    const goOffline = () => setConnection('offline');
    const goOnline = () => { setConnection(socket.connected && joinedRef.current ? 'online' : 'reconnecting'); if (!socket.connected) socket.connect(); flush(); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    if (typeof navigator !== 'undefined' && !navigator.onLine) setConnection('offline');

    return () => {
      offToken();
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      socket.emit('class:leave', { code: roomCode });
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null; joinedRef.current = false;
    };
  }, [active, roomCode, userId, refreshMeta, merge, flush]);

  // Retry unsent captions, and re-render so "speaking" indicators fade out on their own.
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => { setTick((n) => n + 1); if (outbox.current.size) flush(); }, 1500);
    return () => clearInterval(t);
  }, [active, flush]);
  const isSpeaking = (id) => Date.now() - (lastSpeech.current[id] || 0) < 4000;
  const captionsActive = Object.values(lastSpeech.current).some((t) => Date.now() - t < 15000);

  const sendInterim = useCallback((text, source) => socketRef.current?.volatile.emit('class:interim', { code, text, source }), [code]);
  const raiseHand = useCallback((raised) => socketRef.current?.emit('class:hand', { code, raised }), [code]);
  const lowerHand = useCallback((id) => socketRef.current?.emit('class:hand:lower', { code, userId: id }), [code]);
  const replaceCaption = useCallback((cap) => setCaptions((list) => list.map((c) => (c.id === cap.id ? cap : c))), []);

  const live = connection === 'online' && !ended;
  return {
    participants, isSpeaking, captionsActive,
    room, setRoom, replaceCaption, meta, captions, hasMore, interim, hands, count, connection, pending,
    connected: connection === 'online', ended, setEnded, error, refreshMeta,
    live, sendCaption, sendInterim, raiseHand, lowerHand,
  };
}
