// Calls to the EchoSign backend (Render), made from the server only.
// The browser never sees the backend address or the access token: Server Components, Server Actions and Route Handlers
// call the backend for it (the "backend for frontend" pattern).
import 'server-only';
import { env } from '@/lib/env';

/**
 * Fetch a backend path such as '/users/me'.
 * token   - access token, sent as a Bearer header (the backend accepts access tokens only that way)
 * cookie  - a raw Cookie header to pass on (used for refresh and logout)
 * cache / next - the Next.js fetch caching options (see the languages page for revalidation)
 */
export async function backendFetch(path, { method = 'GET', token, cookie, body, cache, next, headers = {} } = {}) {
  return fetch(`${env.BACKEND_URL}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    // Without an explicit choice nothing is cached: account data must always be fresh.
    ...(cache ? { cache } : next ? {} : { cache: 'no-store' }),
    ...(next ? { next } : {}),
  });
}

// The JSON answer of a backend call as { ok, status, data, error, body }. Never throws: a network failure is
// reported as status 0, so pages can show a friendly message instead of crashing.
export async function backendJson(path, options) {
  try {
    const res = await backendFetch(path, options);
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: body.data, error: body.error, body, res };
  } catch {
    return { ok: false, status: 0, data: undefined, error: 'The EchoSign server could not be reached. Please try again in a moment.', body: {}, res: null };
  }
}
