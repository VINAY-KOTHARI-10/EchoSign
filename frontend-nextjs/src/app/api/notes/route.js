// REST API for study notes (INT257: Route Handlers, REST APIs, HTTP methods).
//   GET  /api/notes?q=&tag=&page=   list the signed-in person's notes
//   POST /api/notes                 create a note (JSON body)
// A Route Handler is a file named route.js: each exported function is named after an HTTP method.
import { apiSession, fail, ok, readBody, unauthorized } from '@/lib/api';
import { createNote, listNotes } from '@/features/notes/data';
import { fieldErrors, noteInputSchema } from '@/lib/validation';

export async function GET(request) {
  const session = await apiSession(request);
  if (!session) return unauthorized();
  const { searchParams } = new URL(request.url);
  try {
    const result = await listNotes({
      userId: session.user.id,
      q: (searchParams.get('q') || '').slice(0, 80),
      tag: (searchParams.get('tag') || '').slice(0, 20),
      page: parseInt(searchParams.get('page') || '1', 10) || 1,
    });
    return ok(result);
  } catch (err) {
    console.error('GET /api/notes failed', err?.message);
    return fail('The notes could not be read right now.', 503);
  }
}

export async function POST(request) {
  const session = await apiSession(request);
  if (!session) return unauthorized();
  const body = await readBody(request);
  if (!body || typeof body !== 'object') return fail('Send a JSON body.', 400);
  const parsed = noteInputSchema.safeParse(body);
  if (!parsed.success) return fail('Some fields are not valid.', 422, { errors: fieldErrors(parsed) });
  try {
    const note = await createNote(session.user.id, parsed.data);
    return ok(note, 201); // 201 Created
  } catch (err) {
    console.error('POST /api/notes failed', err?.message);
    return fail('The note could not be saved right now.', 503);
  }
}
