import { download, request, qs, upload } from './client';

export const auth = {
  register: (d) => request('POST', '/auth/register', d),
  login: (d) => request('POST', '/auth/login', d),
  logout: () => request('POST', '/auth/logout'),
  logoutAll: () => request('POST', '/auth/logout-all'),
  sessions: () => request('GET', '/auth/sessions'),
  verifyOtp: (d) => request('POST', '/auth/verify-otp', d),
  resendOtp: (d) => request('POST', '/auth/resend-otp', d),
  forgotPassword: (d) => request('POST', '/auth/forgot-password', d),
  resetPassword: (token, d) => request('POST', `/auth/reset-password/${token}`, d),
};

export const users = {
  me: () => request('GET', '/users/me'),
  updateProfile: (d) => request('PATCH', '/users/profile', d),
  leaderboard: () => request('GET', '/users/leaderboard'),
  permissions: () => request('GET', '/users/permissions'),
};

export const sessions = {
  list: (p) => request('GET', `/sessions${qs(p)}`),
  create: (d) => request('POST', '/sessions', d),
  remove: (id) => request('DELETE', `/sessions/${id}`),
};

export const speech = {
  analyze: (d) => request('POST', '/speech/analyze', d),
  analyzeVoice: (d) => request('POST', '/speech/analyze-voice', d),
  history: (p) => request('GET', `/speech/history${qs(p)}`),
  trend: (days = 30) => request('GET', `/speech/accuracy-trend?days=${days}`),
  skills: (days = 30) => request('GET', `/speech/skill-breakdown?days=${days}`),
};

// People directory (teachers: their students; admins: everyone, and they can edit)
export const people = {
  list: (p) => request('GET', `/people${qs(p)}`),
  get: (id) => request('GET', `/people/${id}`),
  update: (id, d) => request('PATCH', `/people/${id}`, d),
  create: (d) => request('POST', '/people', d),
};

export const chat = {
  messages: (roomId = 'global', page = 1) => request('GET', `/chat/messages${qs({ roomId, page })}`),
  rooms: () => request('GET', '/chat/rooms'),
  markRead: (roomId) => request('POST', `/chat/rooms/${roomId}/read`),
  // a message with a file (image or PDF, at most 2 MB); the caption and the message being replied to are optional
  upload: (roomId, file, { caption, replyToId } = {}) => upload(`/chat/attachments${qs({ roomId, caption, replyToId })}`, file, { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) }),
  attachment: (id) => download(`/chat/attachments/${id}`),
};

export const languages = {
  list: () => request('GET', '/languages'),
};

export const phrases = {
  daily: (p) => request('GET', `/phrases/daily${qs(p)}`),
  random: (p) => request('GET', `/phrases/random${qs(p)}`),
};

export const conversation = {
  chat: (d) => request('POST', '/conversation/chat', d),
};

export const classrooms = {
  create: (d) => request('POST', '/classrooms', d),
  mine: () => request('GET', '/classrooms'),
  get: (code) => request('GET', `/classrooms/${code}`),
  update: (code, d) => request('PATCH', `/classrooms/${code}`, d),
  captions: (code, limit) => request('GET', `/classrooms/${code}/captions${qs({ limit })}`),
  captionsAfter: (code, after) => request('GET', `/classrooms/${code}/captions${qs({ after })}`),
  postCaption: (code, d) => request('POST', `/classrooms/${code}/captions`, d),
  transcript: (code, p) => request('GET', `/classrooms/${code}/transcript${qs(p)}`),
  exportFile: (code, format) => download(`/classrooms/${code}/export${qs({ format })}`),
  getSummary: (code) => request('GET', `/classrooms/${code}/summary`),
  ask: (code, question) => request('POST', `/classrooms/${code}/ask`, { question }),
  stats: () => request('GET', '/classrooms/stats'),
  attended: (page) => request('GET', `/classrooms/attended${qs({ page })}`),
  editCaption: (code, id, text) => request('PATCH', `/classrooms/${code}/captions/${id}`, { text }),
  end: (code) => request('POST', `/classrooms/${code}/end`),
  reopen: (code) => request('POST', `/classrooms/${code}/reopen`),
  translate: (code, texts, target) => request('POST', `/classrooms/${code}/translate`, { texts, target }),
  summary: (code) => request('POST', `/classrooms/${code}/summary`),
  insights: (code) => request('GET', `/classrooms/${code}/insights`),
  setRole: (code, userId, role) => request('PUT', `/classrooms/${code}/members/${userId}/role`, { role }),
};

export const admin = {
  stats: () => request('GET', '/admin/stats'),
  users: (p) => request('GET', `/admin/users${qs(p)}`),
  setRole: (id, role) => request('PATCH', `/admin/users/${id}/role`, { role }),
  deleteUser: (id, confirm) => request('DELETE', `/admin/users/${id}${confirm ? '?confirm=true' : ''}`),
  audit: (p) => request('GET', `/admin/audit${qs(p)}`),
  sessions: (p) => request('GET', `/admin/sessions${qs(p)}`),
  classrooms: (p) => request('GET', `/admin/classrooms${qs(p)}`),
  languages: () => request('GET', '/admin/languages'),
  addLanguage: (d) => request('POST', '/languages', d),
  updateLanguage: (code, d) => request('PATCH', `/admin/languages/${code}`, d),
  deleteLanguage: (code) => request('DELETE', `/admin/languages/${code}`),
};
