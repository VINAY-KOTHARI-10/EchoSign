'use server';

// Server Actions for study notes (INT257: Forms and Server Actions, Data Mutations, Form Validation).
// A Server Action is a function marked 'use server' that a form (or button) can call directly. It runs only on the server,
// where it can check the session, validate with Zod, and write to the database with Prisma. These functions are
// public endpoints in effect, so each one starts by checking who is calling.
import { revalidatePath } from 'next/cache';
import { hasLocale } from '@/i18n/config';
import { requireSession } from '@/lib/session';
import { fieldErrors, noteInputSchema } from '@/lib/validation';
import { createNote, deleteNote, getNote, updateNote } from '@/features/notes/data';

const safeLocale = (value) => (hasLocale(value) ? value : 'en');

function refresh(locale, id) {
  revalidatePath(`/${locale}/notes`);
  revalidatePath(`/${locale}/dashboard`);
  if (id) revalidatePath(`/${locale}/notes/${id}`);
}

// Create a note, or update one when the form carries a hidden "id".
export async function saveNoteAction(_prev, formData) {
  const locale = safeLocale(formData.get('locale'));
  const { user } = await requireSession(locale);
  const id = String(formData.get('id') || '');
  const raw = {
    title: formData.get('title') ?? '',
    body: formData.get('body') ?? '',
    classCode: formData.get('classCode') ?? '',
    tags: formData.get('tags') ?? '',
    pinned: formData.get('pinned') ?? false,
  };
  const parsed = noteInputSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed), values: raw };

  try {
    if (id) {
      const updated = await updateNote(user.id, id, parsed.data);
      if (!updated) return { error: 'missing', values: raw };
    } else {
      await createNote(user.id, parsed.data);
    }
  } catch (err) {
    console.error('saveNoteAction failed', err?.message);
    return { error: 'database', values: raw };
  }
  refresh(locale, id);
  return { saved: Date.now() }; // a new value each time, so the form can reset itself
}

export async function deleteNoteAction(locale, id) {
  const lang = safeLocale(locale);
  const { user } = await requireSession(lang);
  try { await deleteNote(user.id, String(id)); } catch (err) { console.error('deleteNoteAction failed', err?.message); return { error: 'database' }; }
  refresh(lang, id);
  return { ok: true };
}

export async function togglePinAction(locale, id) {
  const lang = safeLocale(locale);
  const { user } = await requireSession(lang);
  try {
    const note = await getNote(user.id, String(id));
    if (!note) return { error: 'missing' };
    await updateNote(user.id, note.id, { pinned: !note.pinned });
  } catch (err) { console.error('togglePinAction failed', err?.message); return { error: 'database' }; }
  refresh(lang, id);
  return { ok: true };
}
