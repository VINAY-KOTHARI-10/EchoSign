import { request, qs } from './client';

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
};

export const sessions = {
  list: (p) => request('GET', `/sessions${qs(p)}`),
  create: (d) => request('POST', '/sessions', d),
  remove: (id) => request('DELETE', `/sessions/${id}`),
};

export const speech = {
  analyze: (d) => request('POST', '/speech/analyze', d),
  history: (p) => request('GET', `/speech/history${qs(p)}`),
  trend: (days = 30) => request('GET', `/speech/accuracy-trend?days=${days}`),
  skills: (days = 30) => request('GET', `/speech/skill-breakdown?days=${days}`),
};

export const chat = {
  messages: (roomId = 'global', page = 1) => request('GET', `/chat/messages${qs({ roomId, page })}`),
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
  deleteUser: (id) => request('DELETE', `/admin/users/${id}`),
  sessions: (p) => request('GET', `/admin/sessions${qs(p)}`),
  classrooms: (p) => request('GET', `/admin/classrooms${qs(p)}`),
  languages: () => request('GET', '/admin/languages'),
  addLanguage: (d) => request('POST', '/languages', d),
  updateLanguage: (id, d) => request('PATCH', `/admin/languages/${id}`, d),
  deleteLanguage: (id) => request('DELETE', `/admin/languages/${id}`),
};
