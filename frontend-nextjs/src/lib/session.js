// Session management: the "data access layer" (INT257: Authentication and Authorization).
// The backend owns accounts and passwords. This site keeps the backend's httpOnly cookies and, on every server render,
// asks the backend "who is this?" with the access token. The answer is cached for the duration of one request.
import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { forbidden, redirect } from 'next/navigation';
import { backendJson } from '@/lib/backend';

export const getAccessToken = async () => (await cookies()).get('accessToken')?.value ?? null;

// { user: { id, username, email, role, ... }, token } or null when nobody is signed in.
export const getSession = cache(async () => {
  const token = await getAccessToken();
  if (!token) return null;
  const me = await backendJson('/users/me', { token });
  if (!me.ok || !me.data?.user) return null;
  return { user: me.data.user, token };
});

// Authentication: signed in, or sent to the sign-in page (and back here afterwards).
export async function requireSession(locale, next) {
  const session = await getSession();
  if (!session) redirect(`/${locale}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  return session;
}

// Authorization (role-based access control): signed in AND one of the allowed roles, else a 403 page.
export async function requireRole(locale, roles, next) {
  const session = await requireSession(locale, next);
  if (!roles.includes(session.user.role)) forbidden();
  return session;
}

export const isAdmin = (user) => user?.role === 'ADMIN';
