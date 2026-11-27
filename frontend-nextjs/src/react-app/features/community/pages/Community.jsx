import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { ArrowDown, ArrowLeft, FileText, Paperclip, Search, Send, Users, X } from 'lucide-react';
import * as api from '../../../api';
import { SOCKET_URL, getToken, refreshAccessToken } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { LoadingState, PageHeader } from '../../../components/ui';
import { ATTACH_TYPES, attachProblem, formatSize, initials, layoutMessages, markDeleted, previewText, senderColor, setReactions, typingText, upsertMessage } from '../../../lib/chatUtils.js';
import ChatMessage from '../components/ChatMessage.jsx';

// The rooms come from the server: General, plus one room for every language the admin has switched on (see the Languages page).
const GENERAL = { id: 'global', code: null, label: 'General', desc: 'Everyone is welcome', mine: false, teachers: [] };
const hueOf = (key = '') => { let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360; return h; };
// General first, then the languages the person learns or teaches, then the rest A to Z.
const orderRooms = (list) => [...list].sort((x, y) => (x.id === 'global' ? -1 : y.id === 'global' ? 1 : (y.mine - x.mine) || x.label.localeCompare(y.label)));

const timeOf = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const shortWhen = (d) => {
  const t = new Date(d); const now = new Date();
  if (t.toDateString() === now.toDateString()) return timeOf(t);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  return t.toDateString() === y.toDateString() ? 'Yesterday' : t.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

const RoomAvatar = ({ room, size = 44 }) => (
  <span className="wa-avatar" style={{ width: size, height: size, background: `hsl(${hueOf(room.code || room.id)} 75% 92%)`, color: `hsl(${hueOf(room.code || room.id)} 55% 30%)`, fontSize: size * 0.4 }} aria-hidden="true">{initials(room.label)}</span>
);

export default function Community() {
  const { user } = useAuth();
  const [room, setRoom] = useState('global');
  const [roomList, setRoomList] = useState([GENERAL]);
  const roomsRef = useRef([GENERAL]);
  const [meta, setMeta] = useState({});                 // roomId -> { unread, lastMessage }
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [selected, setSelected] = useState(null);       // message whose actions are open (tap on a phone)
  const [picking, setPicking] = useState(null);         // message whose reaction bar is open
  const [confirming, setConfirming] = useState(null);   // message waiting for "Delete for everyone?"
  const [online, setOnline] = useState(0);
  const [typers, setTypers] = useState({});             // `${roomId}:${userId}` -> { roomId, name, at }
  const [connected, setConnected] = useState(false);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);              // on a narrow screen: show the chat instead of the room list
  const [below, setBelow] = useState(0);                // messages that arrived while scrolled up
  const [file, setFile] = useState(null);               // a picture or PDF waiting to be sent with the next message
  const [filePreview, setFilePreview] = useState('');
  const [fileError, setFileError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);
  const socketRef = useRef(null);
  const roomRef = useRef(room);
  const listRef = useRef(null);
  const nearBottom = useRef(true);
  const typingTimer = useRef(null);
  const readTimer = useRef(null);
  const inputRef = useRef(null);
  const meId = user.id;

  const scrollToEnd = useCallback((smooth = false) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setBelow(0);
  }, []);

  // Tell the server this room is read (soon after the last thing arrived), and clear its unread badge here.
  const markRead = useCallback((id) => {
    setMeta((m) => ({ ...m, [id]: { ...m[id], unread: 0 } }));
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => { api.chat.markRead(id).catch(() => {}); }, 600);
  }, []);

  const loadRooms = useCallback(() => {
    api.chat.rooms().then((r) => {
      const list = r.data.rooms || [];
      const full = orderRooms(list.map(({ id, code, label, desc, mine, teachers }) => ({ id, code, label, desc, mine, teachers })));
      setRoomList(full); roomsRef.current = full;
      setMeta(Object.fromEntries(list.map((x) => [x.id, { unread: x.id === roomRef.current ? 0 : x.unread, lastMessage: x.lastMessage }])));
      // join every room, so the list can show unread counts and the latest message
      full.forEach((x) => socketRef.current?.connected && socketRef.current.emit('chat:join', x.id));
    }).catch(() => {});
  }, []);

  // One socket for the page. It joins every room so the room list can show unread counts and the latest message.
  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: (cb) => cb({ token: getToken() }), withCredentials: true });
    socketRef.current = socket;
    socket.on('connect_error', async (err) => {
      setConnected(false);
      if (/authentication/i.test(err.message) && (await refreshAccessToken())) setTimeout(() => socket.connect(), 500);
      else if (/busy/i.test(err.message)) setTimeout(() => socket.connect(), 2500); // the server could not reach its database; try again shortly
    });
    socket.on('connect', () => { setConnected(true); roomsRef.current.forEach((r) => socket.emit('chat:join', r.id)); loadRooms(); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('users:online', setOnline);

    socket.on('chat:message', (msg) => {
      const mine = msg.user?.id === meId;
      setMeta((m) => ({ ...m, [msg.roomId]: { lastMessage: msg, unread: msg.roomId === roomRef.current || mine ? 0 : (m[msg.roomId]?.unread || 0) + 1 } }));
      setTypers((t) => { const next = { ...t }; delete next[`${msg.roomId}:${msg.user?.id}`]; return next; });
      if (msg.roomId !== roomRef.current) return;
      setMessages((list) => upsertMessage(list, msg));
      if (mine || nearBottom.current) { requestAnimationFrame(() => scrollToEnd(true)); if (!mine) markRead(msg.roomId); }
      else setBelow((n) => n + 1);
    });
    socket.on('chat:deleted', ({ id, roomId }) => {
      setMeta((m) => (m[roomId]?.lastMessage?.id === id ? { ...m, [roomId]: { ...m[roomId], lastMessage: { ...m[roomId].lastMessage, deleted: true, content: '' } } } : m));
      if (roomId === roomRef.current) setMessages((list) => markDeleted(list, id));
    });
    socket.on('chat:reactions', ({ id, roomId, reactions }) => { if (roomId === roomRef.current) setMessages((list) => setReactions(list, id, reactions)); });
    socket.on('chat:typing', ({ roomId, userId, username, isTyping }) => {
      if (userId === meId) return;
      setTypers((t) => { const next = { ...t }; if (isTyping) next[`${roomId}:${userId}`] = { roomId, name: username, at: Date.now() }; else delete next[`${roomId}:${userId}`]; return next; });
    });
    return () => { clearTimeout(readTimer.current); clearTimeout(typingTimer.current); socket.disconnect(); };
  }, [meId, loadRooms, markRead, scrollToEnd]);

  // A typing notice that is not renewed disappears by itself (the sender may have lost their connection).
  useEffect(() => {
    const t = setInterval(() => setTypers((cur) => {
      const now = Date.now(); const keep = Object.entries(cur).filter(([, v]) => now - v.at < 5000);
      return keep.length === Object.keys(cur).length ? cur : Object.fromEntries(keep);
    }), 1500);
    return () => clearInterval(t);
  }, []);

  // Opening a room: load its messages, mark it read, start at the newest message.
  useEffect(() => {
    roomRef.current = room;
    setMessages([]); setLoading(true); setLoadError(''); setReplyTo(null); setPicking(null); setConfirming(null); setSelected(null); setBelow(0);
    nearBottom.current = true;
    api.chat.messages(room).then((r) => { setMessages(r.data.messages || []); requestAnimationFrame(() => scrollToEnd()); markRead(room); })
      .catch((e) => setLoadError(e.message)).finally(() => setLoading(false));
  }, [room, markRead, scrollToEnd]);

  const onScroll = () => {
    const el = listRef.current; if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    if (nearBottom.current && below) { setBelow(0); markRead(roomRef.current); }
  };

  const chooseFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const problem = attachProblem(f);
    setFileError(problem || '');
    if (problem) return;
    setFile(f);
    setFilePreview((old) => { if (old) URL.revokeObjectURL(old); return f.type.startsWith('image/') ? URL.createObjectURL(f) : ''; });
  };
  const dropFile = () => { setFile(null); setFileError(''); setFilePreview((old) => { if (old) URL.revokeObjectURL(old); return ''; }); };

  // A file goes to the server as its own request; the message then reaches everyone through the room like any other.
  const sendFile = async () => {
    setUploading(true); setFileError('');
    try {
      const res = await api.chat.upload(room, file, { caption: input.trim(), replyToId: replyTo?.id });
      const msg = res.data.message;
      setMessages((list) => upsertMessage(list, msg));
      setMeta((m) => ({ ...m, [room]: { lastMessage: msg, unread: 0 } }));
      requestAnimationFrame(() => scrollToEnd(true));
      dropFile(); setInput(''); setReplyTo(null);
      if (inputRef.current) inputRef.current.style.height = 'auto';
    } catch (err) { setFileError(err.message || 'The file could not be sent.'); }
    finally { setUploading(false); }
  };

  const send = (e) => {
    e?.preventDefault();
    if (file) { if (!uploading) sendFile(); return; }
    const content = input.trim();
    if (!content || !connected) return;
    socketRef.current?.emit('chat:message', { content, roomId: room, replyToId: replyTo?.id });
    socketRef.current?.emit('chat:typing', { roomId: room, isTyping: false });
    setInput(''); setReplyTo(null);
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const onInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
    socketRef.current?.emit('chat:typing', { roomId: room, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socketRef.current?.emit('chat:typing', { roomId: room, isTyping: false }), 2000);
  };

  const onKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } if (e.key === 'Escape') setReplyTo(null); };

  const reply = useCallback((m) => { setReplyTo(m); setPicking(null); setSelected(null); inputRef.current?.focus(); }, []);
  const react = useCallback((id, kind) => { socketRef.current?.emit('chat:react', { messageId: id, kind }); setPicking(null); setSelected(null); }, []);
  const del = useCallback((id) => { socketRef.current?.emit('chat:delete', { messageId: id }); setConfirming(null); setSelected(null); }, []);
  const jump = useCallback((id) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400);
  }, []);

  const current = roomList.find((r) => r.id === room) || GENERAL;
  const items = useMemo(() => layoutMessages(messages), [messages]);
  const typingNames = Object.values(typers).filter((t) => t.roomId === room).map((t) => t.name);
  const shownRooms = roomList.filter((r) => r.label.toLowerCase().includes(search.trim().toLowerCase()));
  const totalUnread = Object.values(meta).reduce((n, m) => n + (m?.unread || 0), 0);

  const openRoom = (id) => { setRoom(id); setOpen(true); };

  return (
    <>
      <PageHeader icon={Users} title="Community" subtitle="Chat with other learners in live language rooms."
        actions={<span className={`conn-chip ${connected ? 'ok' : 'wait'}`} role="status"><i aria-hidden="true" />{connected ? `${online} online` : 'Reconnecting…'}</span>} />

      <div className={`wa ${open ? 'chat-open' : ''}`}>
        <aside className="wa-side" aria-label="Chat rooms">
          <div className="wa-side-head">
            <h2>Chats{totalUnread > 0 && <span className="wa-badge" aria-label={`${totalUnread} unread`}>{totalUnread > 99 ? '99+' : totalUnread}</span>}</h2>
            <div className="wa-search">
              <Search size={16} aria-hidden="true" />
              <input className="input" type="search" placeholder="Search rooms" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search rooms" />
            </div>
          </div>
          <ul className="wa-rooms">
            {shownRooms.map((r) => {
              const m = meta[r.id]; const unread = m?.unread || 0;
              return (
                <li key={r.id}>
                  <button type="button" className={`wa-room ${room === r.id ? 'on' : ''}`} aria-current={room === r.id ? 'true' : undefined} onClick={() => openRoom(r.id)}>
                    <RoomAvatar room={r} />
                    <span className="wa-room-main">
                      <span className="wa-room-top"><b>{r.label}</b>{r.mine && <span className="wa-yours">Yours</span>}{m?.lastMessage && <time className={unread ? 'new' : ''}>{shortWhen(m.lastMessage.createdAt)}</time>}</span>
                      <span className="wa-room-bottom">
                        <span className="wa-preview">{Object.values(typers).some((t) => t.roomId === r.id) ? <em>typing…</em> : m ? previewText(m.lastMessage, meId) : ' '}</span>
                        {unread > 0 && <span className="wa-badge" aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {shownRooms.length === 0 && <li className="wa-none">No rooms match “{search}”.</li>}
          </ul>
        </aside>

        <section className="wa-chat" aria-label={`${current.label} chat`}>
          <header className="wa-chat-head">
            <button type="button" className="icon-btn wa-back" onClick={() => setOpen(false)} aria-label="Back to the room list"><ArrowLeft size={18} aria-hidden="true" /></button>
            <RoomAvatar room={current} size={40} />
            <div className="wa-chat-title">
              <h2>{current.label}</h2>
              <span className={typingNames.length ? 'is-typing' : ''} aria-live="polite">{typingNames.length ? typingText(typingNames) : `${current.desc}${current.teachers?.length ? ` · Teacher${current.teachers.length > 1 ? 's' : ''}: ${current.teachers.map((t) => t.username).join(', ')}` : ''} · ${online} online`}</span>
            </div>
          </header>

          <div className="wa-list" ref={listRef} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions" onClick={() => { setPicking(null); }}>
            {loading ? <LoadingState label="Loading messages…" />
              : loadError ? <div className="wa-empty"><b>Couldn’t load messages</b><span>{loadError}</span></div>
              : messages.length === 0 ? <div className="wa-empty"><b>No messages yet</b><span>Say hello and start the conversation.</span></div>
              : items.map((it) => (it.type === 'day'
                ? <div key={it.key} className="wa-day"><span>{it.label}</span></div>
                : (
                  <ChatMessage key={it.key} msg={it.msg} mine={it.msg.user?.id === meId} first={it.first} meId={meId}
                    selected={selected === it.msg.id} picking={picking === it.msg.id} confirming={confirming === it.msg.id}
                    onSelect={setSelected} onReply={reply} onPick={setPicking} onReact={react} onAskDelete={setConfirming} onDelete={del} onJump={jump} />
                )))}
            {below > 0 && (
              <button type="button" className="wa-jump" onClick={() => { scrollToEnd(true); markRead(room); }}>
                <ArrowDown size={16} aria-hidden="true" /> {below} new message{below > 1 ? 's' : ''}
              </button>
            )}
          </div>

          {replyTo && (
            <div className="wa-replying">
              <div><b style={{ color: senderColor(replyTo.user?.id) }}>{replyTo.user?.id === meId ? 'You' : replyTo.user?.username}</b><span>{replyTo.content || (replyTo.attachment ? (replyTo.attachment.isImage ? 'Photo' : replyTo.attachment.name) : '')}</span></div>
              <button type="button" className="icon-btn" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={16} aria-hidden="true" /></button>
            </div>
          )}
          {(file || fileError) && (
            <div className={`wa-pending ${fileError ? 'bad' : ''}`} role={fileError ? 'alert' : undefined}>
              {file && (
                <>
                  {filePreview ? <img src={filePreview} alt="" /> : <span className="wa-pending-icon"><FileText size={24} aria-hidden="true" /></span>}
                  <div><b>{file.name}</b><span>{uploading ? 'Sending…' : formatSize(file.size)}</span></div>
                  <button type="button" className="icon-btn" onClick={dropFile} aria-label="Remove the file" disabled={uploading}><X size={16} aria-hidden="true" /></button>
                </>
              )}
              {fileError && <p>{fileError}</p>}
            </div>
          )}
          <form className="wa-composer" onSubmit={send}>
            <input ref={fileInput} type="file" accept={ATTACH_TYPES.join(',')} onChange={chooseFile} hidden aria-label="Choose a picture or PDF to send" />
            <button type="button" className="icon-btn wa-attach" onClick={() => fileInput.current?.click()} disabled={uploading} aria-label="Attach a picture or PDF"><Paperclip size={20} aria-hidden="true" /></button>
            <label htmlFor="chat-input" className="sr-only">Message {current.label}</label>
            <textarea id="chat-input" ref={inputRef} className="input" rows={1} value={input} onChange={onInput} onKeyDown={onKeyDown}
              placeholder={file ? 'Add a caption (optional)' : connected ? `Message ${current.label}` : 'Reconnecting…'} maxLength={file ? 500 : 2000} autoComplete="off" />
            <button className="btn btn-primary btn-icon wa-send" disabled={(!input.trim() && !file) || !connected || uploading} aria-label="Send message"><Send size={18} aria-hidden="true" /></button>
          </form>
        </section>
      </div>
    </>
  );
}
