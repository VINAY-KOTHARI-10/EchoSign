import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import * as api from '../api';
import { SOCKET_URL, getToken, refreshAccessToken } from '../api/client';

const byTime = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);

// Everything about one live classroom: the room record, captions, who is here, raised hands, and the
// socket used to send captions. `onIncoming(caption)` fires for captions that arrive live (not history).
export default function useCaptionRoom(code, { userId, onIncoming, onNotice } = {}) {
  const [room, setRoom] = useState(null);
  const [meta, setMeta] = useState({ isHost: false, role: 'STUDENT', canModerate: false });
  const [captions, setCaptions] = useState([]);
  const [interim, setInterim] = useState(null);
  const [hands, setHands] = useState([]);
  const [participants, setParticipants] = useState([]); // everyone in the room right now
  const lastSpeech = useRef({});                         // userId -> time of their latest spoken caption / draft
  const [, setTick] = useState(0);
  const [count, setCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const incomingRef = useRef(onIncoming);
  const noticeRef = useRef(onNotice);
  incomingRef.current = onIncoming;
  noticeRef.current = onNotice;

  const applyMeta = (data) => setMeta({ isHost: data.isHost, role: data.role, canModerate: data.canModerate });

  // Load the classroom and the captions already spoken.
  useEffect(() => {
    let cancelled = false;
    setRoom(null); setCaptions([]); setError('');
    (async () => {
      try {
        const [r, c] = await Promise.all([api.classrooms.get(code), api.classrooms.captions(code)]);
        if (cancelled) return;
        setRoom(r.data.classroom); applyMeta(r.data); setEnded(!r.data.classroom.active);
        setCaptions(c.data.captions);
      } catch (err) { if (!cancelled) setError(err.message); }
    })();
    return () => { cancelled = true; };
  }, [code]);

  const refreshMeta = useCallback(async () => {
    try { const r = await api.classrooms.get(code); setRoom(r.data.classroom); applyMeta(r.data); } catch { /* ignore */ }
  }, [code]);

  // Live connection while the class is running.
  const active = Boolean(room?.active) && !ended;
  const roomCode = room?.code;
  useEffect(() => {
    if (!active) return undefined;
    // `auth` as a function is evaluated on every (re)connect, so a long-lived page never reuses an expired token.
    const socket = io(SOCKET_URL, { auth: (cb) => cb({ token: getToken() }), withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('class:join', { code: roomCode }, (res) => {
        if (!res?.ok) { noticeRef.current?.(res?.error || 'Could not join', 'error'); return; }
        setCount(res.count); setHands(res.hands || []); setParticipants(res.participants || []);
        setMeta((m) => ({ ...m, isHost: res.isHost, canModerate: res.canModerate }));
      });
    });
    socket.on('disconnect', () => setConnected(false));
    // If the server rejected an expired token, get a new one and try again.
    socket.on('connect_error', async (err) => {
      setConnected(false);
      if (/authentication/i.test(err.message) && (await refreshAccessToken())) setTimeout(() => socket.connect(), 500);
    });
    socket.on('class:presence', (p) => setCount(p.count));
    socket.on('class:interim', (i) => { if (i.source === 'SPEECH') lastSpeech.current[i.speakerId] = Date.now(); setInterim(i); });
    socket.on('class:participants', setParticipants);
    socket.on('class:hands', setHands);
    socket.on('class:caption', (cap) => {
      if (cap.source === 'SPEECH' && cap.speakerId) lastSpeech.current[cap.speakerId] = Date.now();
      // Keep chronological order even if a slower save is delivered after a faster one.
      setCaptions((list) => (list.some((x) => x.id === cap.id) ? list : [...list, cap].sort(byTime)));
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
    return () => { socket.emit('class:leave', { code: roomCode }); socket.disconnect(); socketRef.current = null; };
  }, [active, roomCode, userId, refreshMeta]);

  // Re-render every couple of seconds so "speaking" indicators fade out on their own.
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 1500);
    return () => clearInterval(t);
  }, [active]);
  const isSpeaking = (id) => Date.now() - (lastSpeech.current[id] || 0) < 4000;
  const captionsActive = Object.values(lastSpeech.current).some((t) => Date.now() - t < 15000);

  const sendCaption = useCallback((text, source) => socketRef.current?.emit('class:caption', { code, text, source }), [code]);
  const sendInterim = useCallback((text, source) => socketRef.current?.emit('class:interim', { code, text, source }), [code]);
  const raiseHand = useCallback((raised) => socketRef.current?.emit('class:hand', { code, raised }), [code]);
  const lowerHand = useCallback((id) => socketRef.current?.emit('class:hand:lower', { code, userId: id }), [code]);

  const replaceCaption = useCallback((cap) => setCaptions((list) => list.map((c) => (c.id === cap.id ? cap : c))), []);

  return {
    participants, isSpeaking, captionsActive,
    room, setRoom, replaceCaption, meta, captions, interim, hands, count, connected, ended, setEnded, error, refreshMeta,
    live: connected && !ended, sendCaption, sendInterim, raiseHand, lowerHand,
  };
}
