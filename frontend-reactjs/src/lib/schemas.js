// Form validation schemas (Zod). One place describes what a valid form looks like; the pages only run the schema and
// show its messages. The password rules are the same as the server's (see lib/password.js and backend passwordPolicy).
import { z } from 'zod';
import { passwordChecks } from './password.js';

const FAILURE_MESSAGES = {
  len: 'Use at least 8 characters.',
  mix: 'Include at least one letter and one number.',
  common: 'That password is too common. Choose a less guessable one.',
  email: 'Do not use your email name in the password.',
};

export const emailSchema = z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address, like you@school.edu.');

export const usernameSchema = z.string().trim()
  .min(3, 'Username must be at least 3 characters.')
  .max(20, 'Username can be at most 20 characters.');

// A new password: every rule from the checklist must pass.
export const newPasswordSchema = (email = '') => z.string().superRefine((value, ctx) => {
  const failed = passwordChecks(value, email).find((c) => !c.ok);
  if (failed) ctx.addIssue({ code: 'custom', message: FAILURE_MESSAGES[failed.id] });
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: z.string(),
  confirm: z.string(),
}).superRefine((form, ctx) => {
  const result = newPasswordSchema(form.email).safeParse(form.password);
  if (!result.success) ctx.addIssue({ code: 'custom', path: ['password'], message: result.error.issues[0].message });
  if (!form.confirm) ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'Repeat the password to confirm it.' });
  else if (form.confirm !== form.password) ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'The two passwords do not match.' });
});

export const forgotSchema = z.object({ email: emailSchema });

export const resetSchema = z.object({
  password: z.string(),
  confirm: z.string(),
}).superRefine((form, ctx) => {
  const result = newPasswordSchema().safeParse(form.password);
  if (!result.success) ctx.addIssue({ code: 'custom', path: ['password'], message: result.error.issues[0].message });
  if (form.confirm !== form.password) ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'The two passwords do not match.' });
});

// { field: first message } from a failed parse, or {} when the data is valid.
export function fieldErrors(result) {
  if (result.success) return {};
  const out = {};
  result.error.issues.forEach((issue) => {
    const key = String(issue.path[0] ?? 'form');
    if (!out[key]) out[key] = issue.message;
  });
  return out;
}
