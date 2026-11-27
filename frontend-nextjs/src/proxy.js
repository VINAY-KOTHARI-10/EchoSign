// proxy.js (called "middleware" before Next.js 16) runs before every page is rendered. It does two jobs:
//   1. Internationalization: an address with no language (/library) is sent to one with it (/en/library),
//      chosen from the saved choice or the browser's language.
//   2. Authentication: protected pages need a signed-in person. If the short-lived access token has expired, the proxy
//      renews it with the refresh cookie (the backend rotates it), so the page renders with a valid login.
// The real security check also happens again on the server in lib/session.js; the proxy is the fast first gate.
import { NextResponse } from 'next/server';
import { defaultLocale, hasLocale, negotiateLocale } from '@/i18n/config';
import { isFresh } from '@/lib/jwt';
import { applyCookieLines, clearLoginCookies, parseSetCookie } from '@/lib/cookies';

// Every private page: the cloned EchoSign pages and the Next.js-only pages (overview, lectures, notes).
const PROTECTED = ['classroom', 'signs', 'meet', 'dashboard', 'conversation', 'progress', 'history', 'leaderboard', 'community', 'profile', 'library', 'access', 'teacher', 'directory', 'admin', 'overview', 'lectures', 'notes'];
const BACKEND = (process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/+$/, '');

// The refresh token can be used once. When several requests arrive at the same moment with the same expired login (the
// page and its prefetches), they share one refresh instead of racing each other. Kept for a few seconds per server instance.
const inFlight = new Map();

function refreshOnce(refreshToken) {
  if (!inFlight.has(refreshToken)) {
    const task = (async () => {
      try {
        const res = await fetch(`${BACKEND}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { Cookie: `refreshToken=${refreshToken}` },
          cache: 'no-store',
        });
        if (res.status >= 500) return { unavailable: true };
        if (!res.ok) return { failed: true };
        return { lines: res.headers.getSetCookie() };
      } catch {
        return { unavailable: true };
      }
    })();
    inFlight.set(refreshToken, task);
    setTimeout(() => inFlight.delete(refreshToken), 8000);
  }
  return inFlight.get(refreshToken);
}

// Replace or add cookies in a raw Cookie header (so the page being rendered sees the renewed login).
function mergeCookieHeader(header, lines) {
  const jar = new Map(String(header || '').split(';').map((p) => p.trim()).filter(Boolean).map((p) => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; }));
  lines.forEach((line) => {
    const c = parseSetCookie(line);
    if (!c) return;
    if (c.remove) jar.delete(c.name); else jar.set(c.name, encodeURIComponent(c.value));
  });
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

export async function proxy(request) {
  const { pathname, search } = request.nextUrl;
  const parts = pathname.split('/').filter(Boolean);

  // 1. Language
  if (!hasLocale(parts[0])) {
    const saved = request.cookies.get('NEXT_LOCALE')?.value;
    const locale = hasLocale(saved) ? saved : negotiateLocale(request.headers.get('accept-language')) || defaultLocale;
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
    return NextResponse.redirect(url);
  }
  const locale = parts[0];

  // 2. Protected pages
  if (!PROTECTED.includes(parts[1])) return NextResponse.next();

  const toLogin = () => {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  };

  const access = request.cookies.get('accessToken')?.value;
  if (isFresh(access)) return NextResponse.next();

  const refresh = request.cookies.get('refreshToken')?.value;
  if (!refresh) return toLogin();

  const result = await refreshOnce(refresh);
  if (result.unavailable) return NextResponse.next(); // the server is busy: let the page decide, do not sign anyone out
  if (result.failed) {
    const res = toLogin();
    clearLoginCookies(res.cookies);
    return res;
  }

  const headers = new Headers(request.headers);
  headers.set('cookie', mergeCookieHeader(request.headers.get('cookie'), result.lines));
  const response = NextResponse.next({ request: { headers } });
  applyCookieLines(result.lines, response.cookies);
  return response;
}

export const config = {
  // Everything except API routes, Next.js internals and files with an extension (images, icons, robots.txt...).
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
