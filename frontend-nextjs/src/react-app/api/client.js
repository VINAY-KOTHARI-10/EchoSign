// Fetch wrapper: access token lives in memory, refresh token is an httpOnly cookie.
// Production: the backend serves this app, so the API lives on the same origin. Development: Vite on :5173
// talks to the backend on :5000. Set VITE_API_URL to point somewhere else.
export const API_URL = '/api/v1';
// undefined = connect Socket.IO to the page's own origin. Split deploy (Vercel + Render): VITE_SOCKET_URL is the
// backend address, because Vercel cannot proxy WebSockets. Sockets authenticate with the token, not a cookie.
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || undefined; // undefined = this site's own address

let accessToken = null;

const tokenListeners = new Set();
export const setToken = (t) => { accessToken = t || null; tokenListeners.forEach((fn) => fn(accessToken)); };
// Lets long-lived connections (sockets) pick up a refreshed access token without reconnecting.
export const onTokenChange = (fn) => { tokenListeners.add(fn); return () => tokenListeners.delete(fn); };
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

// True when the last refresh failed because the network was unreachable (as opposed to the session being invalid).
let lastRefreshWasOffline = false;
export const refreshFailedOffline = () => lastRefreshWasOffline;

// Refresh tokens rotate (each is single-use), so two refreshes at the same moment would race: the second one presents
// a token the first has just retired. Everyone who asks while a refresh is running shares that one request.
let refreshInFlight = null;
export const refreshAccessToken = () => {
  if (refreshInFlight) return refreshInFlight;
  lastRefreshWasOffline = false;
  refreshInFlight = (async () => {
    // A server error (for example the database being briefly unreachable) is not "you are signed out": try again a
    // few times, and if it still fails treat it like being offline so the person is not thrown to the sign-in page.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.data?.accessToken) {
          setToken(data.data.accessToken);
          lastRefreshWasOffline = false;
          return true;
        }
        if (res.status < 500) { lastRefreshWasOffline = false; return false; } // 401 etc.: the session really is gone
        lastRefreshWasOffline = true;
      } catch { lastRefreshWasOffline = true; /* offline or server unreachable */ }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
    return false;
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
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

// Download a file the API protects with the access token (exports). Returns { blob, filename, type }.
export const download = async (path, retried = false) => {
  const res = await fetch(`${API_URL}${path}`, { credentials: 'include', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  if (res.status === 401 && !retried && (await refreshAccessToken())) return download(path, true);
  if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || `Download failed (${res.status})`); }
  const cd = res.headers.get('content-disposition') || '';
  return { blob: await res.blob(), filename: (cd.match(/filename="([^"]+)"/) || [])[1] || 'download', type: res.headers.get('content-type') || '' };
};
// Send a file as the request body (chat attachments). The server reads the bytes and checks what they really are.
export const upload = async (path, body, headers = {}, retried = false) => {
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', credentials: 'include', headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...headers }, body });
  if (res.status === 401 && !retried && (await refreshAccessToken())) return upload(path, body, headers, true);
  return parse(res);
};
