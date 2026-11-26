// Input validation with Zod (INT257: Form Validation, Data Validation).
// The same schemas are used by the Server Actions (forms) and the Route Handlers (REST API), so a rule is written once.
import { z } from 'zod';
import { passwordChecks } from '@/lib/password';

const PASSWORD_MESSAGES = {
  len: 'Use at least 8 characters.',
  mix: 'Include at least one letter and one number.',
  common: 'That password is too common. Choose a less guessable one.',
  email: 'Do not use your email name in the password.',
};

const email = z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
});

export const registerSchema = z.object({
  email,
  username: z.string().trim().min(3, 'Username must be at least 3 characters.').max(20, 'Username can be at most 20 characters.'),
  password: z.string(),
  confirm: z.string().default(''),
}).superRefine((form, ctx) => {
  const failed = passwordChecks(form.password, form.email).find((c) => !c.ok);
  if (failed) ctx.addIssue({ code: 'custom', path: ['password'], message: PASSWORD_MESSAGES[failed.id] });
  if (!form.confirm) ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'Repeat the password to confirm it.' });
  else if (form.confirm !== form.password) ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'The two passwords do not match.' });
});

export const forgotSchema = z.object({ email });

export const resetSchema = z.object({ password: z.string(), confirm: z.string() }).superRefine((form, ctx) => {
  const failed = passwordChecks(form.password).find((c) => !c.ok);
  if (failed) ctx.addIssue({ code: 'custom', path: ['password'], message: PASSWORD_MESSAGES[failed.id] });
  if (form.confirm !== form.password) ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'The two passwords do not match.' });
});

export const otpSchema = z.object({
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email.'),
  preAuthToken: z.string().min(1),
});

// The fields of a note. "tags" arrives as "a, b, c" from a form or as an array from the REST API.
const titleField = z.string().trim().min(1, 'Give the note a title.').max(120, 'The title can be at most 120 characters.');
const bodyField = z.string().max(5000, 'The note can be at most 5000 characters.');
const classCodeField = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : typeof v === 'string' ? v.trim().toUpperCase() : v),
  z.string().regex(/^[A-Z0-9]{6}$/, 'A class code is 6 letters or numbers.').nullable(),
);
const tagsField = z.preprocess(
  (v) => (typeof v === 'string' ? v.split(',').map((t) => t.trim()).filter(Boolean) : v),
  z.array(z.string().min(1).max(20, 'Each tag can be at most 20 characters.')).max(5, 'Use at most 5 tags.'),
);
const pinnedField = z.preprocess((v) => v === true || v === 'true' || v === 'on', z.boolean());

// Create / replace: missing optional fields get their defaults.
export const noteInputSchema = z.object({
  title: titleField,
  body: bodyField.default(''),
  classCode: classCodeField.default(null),
  tags: tagsField.default([]),
  pinned: pinnedField.default(false),
});

// Partial update (PATCH): only the fields that were sent are checked and changed.
export const notePatchSchema = z.object({
  title: titleField.optional(),
  body: bodyField.optional(),
  classCode: classCodeField.optional(),
  tags: tagsField.optional(),
  pinned: pinnedField.optional(),
});

// { field: first message } from a failed parse, or {}.
export function fieldErrors(result) {
  if (result.success) return {};
  const out = {};
  result.error.issues.forEach((issue) => {
    const key = String(issue.path[0] ?? 'form');
    if (!out[key]) out[key] = issue.message;
  });
  return out;
}
