// Reading the expiry time of an access token (no secret needed: only the backend can verify the signature).
// Used by the proxy to decide when to renew the login before it expires.
export function tokenExpiry(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? atob(payload) : Buffer.from(payload, 'base64').toString();
    const { exp } = JSON.parse(json);
    return typeof exp === 'number' ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export const isFresh = (token, marginMs = 15000) => Boolean(token) && tokenExpiry(token) > Date.now() + marginMs;
