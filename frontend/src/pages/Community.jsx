import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Hash, Send, Users } from 'lucide-react';
import * as api from '../api';
import { SOCKET_URL, getToken, refreshAccessToken } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../components/ui';

const ROOMS = [
  { id: 'global', label: 'General', desc: 'Everyone' },
  { id: 'english', label: 'English learners', desc: 'English practice' },
  { id: 'spanish', label: 'Spanish learners', desc: 'Spanish practice' },
  { id: 'french', label: 'French learners', desc: 'French practice' },
  { id: 'japanese', label: 'Japanese learners', desc: 'Japanese practice' },
];

const timeOf = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function Community() {
  const { user } = useAuth();
  const [room, setRoom] = useState('global');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [input, setInput] = useState('');
  const [online, setOnline] = useState(0);
  const [typing, setTyping] = useState('');
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const roomRef = useRef(room);
  const endRef = useRef(null);
  const typingTimer = useRef(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: (cb) => cb({ token: getToken() }), withCredentials: true });
    socket.on('connect_error', async (err) => {
      setConnected(false);
      if (/authentication/i.test(err.message) && (await refreshAccessToken())) setTimeout(() => socket.connect(), 500);
    });
    socketRef.current = socket;
    socket.on('connect', () => { setConnected(true); socket.emit('chat:join', roomRef.current); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('users:online', setOnline);
    socket.on('chat:message', (msg) => { if (msg.roomId === roomRef.current) setMessages((m) => [...m, msg]); });
    socket.on('chat:userJoined', (d) => setMessages((m) => [...m, { id: `sys-${Date.now()}`, system: true, content: `${d.username} joined the room` }]));
    socket.on('chat:typing', ({ username, isTyping }) => setTyping(isTyping ? `${username} is typing…` : ''));
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    const prev = roomRef.current;
    roomRef.current = room;
    const socket = socketRef.current;
    if (socket?.connected && prev !== room) { socket.emit('chat:leave', prev); socket.emit('chat:join', room); }
    setMessages([]); setTyping(''); setLoading(true); setLoadError('');
    api.chat.messages(room).then((r) => setMessages(r.data.messages || [])).catch((e) => setLoadError(e.message)).finally(() => setLoading(false));
  }, [room]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);

  const send = (e) => {
    e.preventDefault();
    const content = input.trim();
    if (!content) return;
    socketRef.current?.emit('chat:message', { content, roomId: room });
    socketRef.current?.emit('chat:typing', { roomId: room, isTyping: false });
    setInput('');
  };

  const onChange = (e) => {
    setInput(e.target.value);
    socketRef.current?.emit('chat:typing', { roomId: room, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socketRef.current?.emit('chat:typing', { roomId: room, isTyping: false }), 2000);
  };

  const current = ROOMS.find((r) => r.id === room);

  return (
    <>
      <PageHeader icon={Users} title="Community" subtitle="Chat with other learners in live language rooms."
        actions={connected
          ? <StatusBadge status="ok">Connected · {online} online</StatusBadge>
          : <StatusBadge status="warn">Reconnecting…</StatusBadge>} />

      <div className="community-layout">
        <nav className="card channels" aria-label="Chat rooms">
          <h2 className="card-title">Rooms</h2>
          <ul>
            {ROOMS.map((r) => (
              <li key={r.id}>
                <button className={`channel ${room === r.id ? 'on' : ''}`} aria-current={room === r.id ? 'true' : undefined} onClick={() => setRoom(r.id)}>
                  <Hash size={16} aria-hidden="true" /><span><b>{r.label}</b><small>{r.desc}</small></span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className="card chat-box" aria-label={`${current.label} chat`}>
          <div className="chat-head"><h2><Hash size={16} aria-hidden="true" style={{ display: 'inline', verticalAlign: -2 }} /> {current.label}</h2></div>
          <div className="messages" role="log" aria-live="polite" aria-relevant="additions">
            {loading ? <LoadingState label="Loading messages…" />
              : loadError ? <EmptyState title="Couldn’t load messages">{loadError}</EmptyState>
              : messages.length === 0 ? <EmptyState icon={Users} title="No messages yet">Say hello and start the conversation.</EmptyState>
              : messages.map((m) => m.system
                ? <div key={m.id} className="system-msg">{m.content}</div>
                : (
                  <div key={m.id} className={`msg ${m.user?.id === user.id ? 'me' : 'them'}`}>
                    <div className="avatar-sm" aria-hidden="true">{(m.user?.username || '?')[0].toUpperCase()}</div>
                    <div className="msg-body">
                      <div className="msg-meta" style={{ marginTop: 0, marginBottom: 2 }}><b style={{ color: 'var(--ink)' }}>{m.user?.id === user.id ? 'You' : m.user?.username}</b><time dateTime={new Date(m.createdAt).toISOString()}>{timeOf(m.createdAt)}</time></div>
                      <div className={`bubble ${m.user?.id === user.id ? 'me' : 'them'}`}>{m.content}</div>
                    </div>
                  </div>
                ))}
            <div ref={endRef} />
          </div>
          <div className="chat-status" aria-live="polite">{typing}</div>
          <form className="composer" onSubmit={send}>
            <label htmlFor="chat-input" className="sr-only">Message {current.label}</label>
            <input id="chat-input" className="input" value={input} onChange={onChange} placeholder={`Message ${current.label}`} maxLength={2000} autoComplete="off" />
            <button className="btn btn-primary btn-icon" disabled={!input.trim() || !connected} aria-label="Send message"><Send size={18} aria-hidden="true" /></button>
          </form>
        </section>
      </div>
    </>
  );
}
