// Helpers for Route Handlers (the REST API under /api).
import 'server-only';
import { NextResponse } from 'next/server';
import { backendJson } from '@/lib/backend';
import { getSession } from '@/lib/session';

// Who is calling? An API client may send "Authorization: Bearer <access token>"; the browser uses its cookie.
export async function apiSession(request) {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7);
    const me = await backendJson('/users/me', { token });
    return me.ok && me.data?.user ? { user: me.data.user, token } : null;
  }
  return getSession();
}

export const ok = (data, status = 200) => NextResponse.json({ success: true, data }, { status });
export const fail = (error, status = 400, extra = {}) => NextResponse.json({ success: false, error, ...extra }, { status });
export const unauthorized = () => fail('Sign in first.', 401);
export const notFound = () => fail('Note not found.', 404);

// Read a JSON body without throwing on an empty or invalid one.
export async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}
