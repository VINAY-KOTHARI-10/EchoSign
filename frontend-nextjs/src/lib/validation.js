// Input validation with Zod (INT257: Form Validation, Data Validation).
// The same schemas are used by the Server Actions (forms) and the Route Handlers (REST API), so a rule is written once.
import { z } from 'zod';

const email = z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
});

export const registerSchema = z.object({
  email,
  username: z.string().trim().min(3, 'Username must be at least 3 characters.').max(20, 'Username can be at most 20 characters.'),
  password: z.string()
    .min(8, 'Use at least 8 characters.')
    .regex(/[A-Za-z]/, 'Include at least one letter.')
    .regex(/\d/, 'Include at least one number.'),
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
