// Lectures from the EchoSign backend (server-only: the access token never reaches the browser).
import 'server-only';
import { backendJson } from '@/lib/backend';

// The classes this person joined, 12 per page. { ok, classes, pagination, error }
export async function getAttended(token, page = 1) {
  const r = await backendJson(`/classrooms/attended?page=${page}`, { token });
  return { ok: r.ok, status: r.status, classes: r.data?.classes ?? [], pagination: r.data?.pagination ?? { page, pages: 1, total: 0 }, error: r.error };
}

// Saved notes, key terms and quiz of one lecture. { ok, status, classroom, summary, error }
export async function getLecture(token, code) {
  const r = await backendJson(`/classrooms/${encodeURIComponent(code)}/summary`, { token });
  return { ok: r.ok, status: r.status, classroom: r.data?.classroom, summary: r.data?.summary, error: r.error };
}
