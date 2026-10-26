// A DYNAMIC Route Handler: /api/notes/<id>. In Next.js 16 `params` is a Promise, so it is awaited.
//   GET    read one note
//   PUT    replace a note (all fields)
//   PATCH  change some fields
//   DELETE remove a note       (204 No Content)
// Every query is limited to the signed-in person's own notes, so someone else's id simply returns 404.
import { NextResponse } from 'next/server';
import { apiSession, fail, notFound, ok, readBody, unauthorized } from '@/lib/api';
import { deleteNote, getNote, updateNote } from '@/features/notes/data';
import { fieldErrors, noteInputSchema, notePatchSchema } from '@/lib/validation';

export async function GET(request, { params }) {
  const session = await apiSession(request);
  if (!session) return unauthorized();
  const { id } = await params;
  const note = await getNote(session.user.id, id).catch(() => null);
  return note ? ok(note) : notFound();
}

export async function PUT(request, { params }) {
  const session = await apiSession(request);
  if (!session) return unauthorized();
  const { id } = await params;
  const body = await readBody(request);
  if (!body || typeof body !== 'object') return fail('Send a JSON body.', 400);
  const parsed = noteInputSchema.safeParse(body);
  if (!parsed.success) return fail('Some fields are not valid.', 422, { errors: fieldErrors(parsed) });
  const note = await updateNote(session.user.id, id, parsed.data).catch(() => null);
  return note ? ok(note) : notFound();
}

export async function PATCH(request, { params }) {
  const session = await apiSession(request);
  if (!session) return unauthorized();
  const { id } = await params;
  const body = await readBody(request);
  if (!body || typeof body !== 'object') return fail('Send a JSON body.', 400);
  // Only the fields that were sent are checked and changed.
  const sent = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  const parsed = notePatchSchema.safeParse(sent);
  if (!parsed.success) return fail('Some fields are not valid.', 422, { errors: fieldErrors(parsed) });
  const changes = Object.fromEntries(Object.entries(parsed.data).filter(([key]) => key in sent));
  if (Object.keys(changes).length === 0) return fail('Nothing to change.', 400);
  const note = await updateNote(session.user.id, id, changes).catch(() => null);
  return note ? ok(note) : notFound();
}

export async function DELETE(request, { params }) {
  const session = await apiSession(request);
  if (!session) return unauthorized();
  const { id } = await params;
  const deleted = await deleteNote(session.user.id, id).catch(() => false);
  return deleted ? new NextResponse(null, { status: 204 }) : notFound();
}
