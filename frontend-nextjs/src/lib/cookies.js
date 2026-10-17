// Moving the backend's login cookies onto this site.
// The backend answers a sign-in with Set-Cookie headers (accessToken, refreshToken, lw_refresh). Because the browser talks to
// this site, not to the backend, the server passes those cookies on. They stay httpOnly, so page scripts cannot read them.

const isProd = process.env.NODE_ENV === 'production';

// One "Set-Cookie" header line -> { name, value, options, remove }
export function parseSetCookie(line) {
  const [pair, ...attrs] = String(line).split(';').map((s) => s.trim());
  const eq = pair.indexOf('=');
  if (eq < 1) return null;
  const name = pair.slice(0, eq);
  let value = pair.slice(eq + 1);
  try { value = decodeURIComponent(value); } catch { /* keep the raw value */ }
  const options = { path: '/', httpOnly: true, secure: isProd, sameSite: 'lax' };
  let expired = false;
  attrs.forEach((attr) => {
    const [k, ...rest] = attr.split('=');
    const v = rest.join('=');
    switch (k.toLowerCase()) {
      case 'path': options.path = v || '/'; break;
      case 'max-age': { const n = Number(v); if (Number.isFinite(n)) { options.maxAge = n; if (n <= 0) expired = true; } break; }
      case 'expires': { const d = new Date(v); if (!Number.isNaN(d.getTime())) { options.expires = d; if (d.getTime() <= Date.now()) expired = true; } break; }
      default: break;
    }
  });
  return { name, value, options, remove: value === '' || expired };
}

export const setCookieLines = (res) => (res && res.headers && typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []);

// Copy the Set-Cookie lines of a backend response into a cookie store
// (works for `await cookies()` in Server Actions and for `response.cookies` in the proxy).
export function applyCookieLines(lines, store) {
  lines.forEach((line) => {
    const c = parseSetCookie(line);
    if (!c) return;
    if (c.remove) store.set(c.name, '', { ...c.options, maxAge: 0 });
    else store.set(c.name, c.value, c.options);
  });
}

// Sign out: remove every login cookie from this site.
export function clearLoginCookies(store) {
  ['accessToken', 'refreshToken'].forEach((name) => store.set(name, '', { path: '/', maxAge: 0 }));
  store.set('lw_refresh', '', { path: '/api/v1/auth', maxAge: 0 });
}
