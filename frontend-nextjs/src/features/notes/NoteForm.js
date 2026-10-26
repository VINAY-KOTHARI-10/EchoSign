'use client';

// The note form, used to create a note and to edit one. It calls the saveNoteAction Server Action through useActionState,
// which returns the action's result (field errors, or "saved") so the form can show it. It also works without JavaScript.
// Uses the same field classes as every other form in EchoSign.
import { useActionState, useEffect, useRef } from 'react';
import { saveNoteAction } from '@/features/notes/actions';

function FieldError({ id, message }) {
  return message ? <span id={id} className="hint err" role="alert">{message}</span> : null;
}

// `onOptimistic` lets the list show the new note straight away, before the server has answered.
export default function NoteForm({ locale, dict, note, onOptimistic }) {
  const [state, action, pending] = useActionState(saveNoteAction, {});
  const formRef = useRef(null);
  const editing = Boolean(note);
  const errors = state.errors || {};
  const values = state.values || {};

  // After a successful CREATE, empty the form.
  useEffect(() => { if (state.saved && !editing) formRef.current?.reset(); }, [state.saved, editing]);

  const submit = (formData) => {
    if (onOptimistic) {
      onOptimistic({
        id: `tmp-${Date.now()}`,
        title: String(formData.get('title') || ''),
        body: String(formData.get('body') || ''),
        classCode: String(formData.get('classCode') || '') || null,
        tags: String(formData.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean),
        pinned: formData.get('pinned') === 'on',
        updatedAt: new Date().toISOString(),
        pending: true,
      });
    }
    return action(formData);
  };

  return (
    <form ref={formRef} action={submit} noValidate className="card">
      <input type="hidden" name="locale" value={locale} />
      {editing && <input type="hidden" name="id" value={note.id} />}

      <div className="field">
        <label htmlFor="title">{dict.notes.noteTitle}</label>
        <input id="title" name="title" className="input" maxLength={120} defaultValue={values.title ?? note?.title ?? ''} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? 'title-err' : undefined} />
        <FieldError id="title-err" message={errors.title} />
      </div>
      <div className="field">
        <label htmlFor="body">{dict.notes.body}</label>
        <textarea id="body" name="body" className="input" rows={editing ? 8 : 4} maxLength={5000} defaultValue={values.body ?? note?.body ?? ''} aria-invalid={Boolean(errors.body)} aria-describedby={errors.body ? 'body-err' : undefined} style={{ height: 'auto', paddingTop: 12 }} />
        <FieldError id="body-err" message={errors.body} />
      </div>
      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="classCode">{dict.notes.classCode}</label>
          <input id="classCode" name="classCode" className="input mono" maxLength={6} defaultValue={values.classCode ?? note?.classCode ?? ''} aria-invalid={Boolean(errors.classCode)} aria-describedby={errors.classCode ? 'code-err' : undefined} style={{ textTransform: 'uppercase' }} />
          <FieldError id="code-err" message={errors.classCode} />
        </div>
        <div className="field">
          <label htmlFor="tags">{dict.notes.tags}</label>
          <input id="tags" name="tags" className="input" defaultValue={values.tags ?? note?.tags?.join(', ') ?? ''} aria-invalid={Boolean(errors.tags)} aria-describedby={errors.tags ? 'tags-err' : undefined} />
          <FieldError id="tags-err" message={errors.tags} />
        </div>
      </div>
      <label className="row" style={{ gap: 8, marginBottom: 16, fontWeight: 600 }}>
        <input type="checkbox" name="pinned" defaultChecked={note?.pinned ?? false} /> {dict.notes.pinned}
      </label>

      {state.error && <div className="error-text" role="alert">{state.error === 'database' ? dict.common.somethingWrongBody : dict.common.notFoundBody}</div>}
      {state.saved && <p className="notice" role="status">{dict.notes.saved}</p>}

      <button className="btn btn-primary" disabled={pending}>{pending ? dict.notes.saving : editing ? dict.notes.update : dict.notes.save}</button>
    </form>
  );
}
