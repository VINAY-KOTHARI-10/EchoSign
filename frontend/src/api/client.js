// Fetch wrapper: access token lives in memory, refresh token is an httpOnly cookie.
// Production: the backend serves this app, so the API lives on the same origin. Development: Vite on :5173
// talks to the backend on :5000. Set VITE_API_URL to point somewhere else.
export const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api/v1' : 'http://localhost:5000/api/v1');
// undefined = connect Socket.IO to the page's own origin. Split deploy (Vercel + Render): VITE_SOCKET_URL is the
// backend address, because Vercel cannot proxy WebSockets. Sockets authenticate with the token, not a cookie.
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (/^https?:/.test(API_URL) ? API_URL.replace(/\/api\/v1\/?$/, '') : undefined);

let accessToken = null;

export const setToken = (t) => { accessToken = t || null; };
export const getToken = () => accessToken;

const parse = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = data.details;
    throw err;
  }
  return data;
};

export const refreshAccessToken = async () => {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.data?.accessToken) {
      setToken(data.data.accessToken);
      return true;
    }
  } catch { /* offline or no cookie */ }
  return false;
};

export const request = async (method, path, body, retried = false) => {
  const init = {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  };
  if (body !== undefined && method !== 'GET') init.body = JSON.stringify(body);

  const res = await fetch(`${API_URL}${path}`, init);
  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await refreshAccessToken()) return request(method, path, body, true);
  }
  return parse(res);
};

export const qs = (params = {}) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ).toString();
  return s ? `?${s}` : '';
};
