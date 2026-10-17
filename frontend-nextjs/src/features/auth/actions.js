'use server';

// Server Actions for signing in, creating an account and signing out (INT257: Server Actions, Authentication).
// They run on the server, so passwords and codes go from the form to this server to the EchoSign backend, never through
// browser-side scripts. Each action validates its input with Zod, then passes the backend's login cookies on to the browser.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { backendFetch } from '@/lib/backend';
import { applyCookieLines, clearLoginCookies, setCookieLines } from '@/lib/cookies';
import { hasLocale } from '@/i18n/config';
import { fieldErrors, loginSchema, otpSchema, registerSchema } from '@/lib/validation';

const safeLocale = (value) => (hasLocale(value) ? value : 'en');
// Only allow going back to an address on this site ("/en/notes"), never to another website.
const safeNext = (value, locale) => (typeof value === 'string' && value.startsWith(`/${locale}/`) && !value.startsWith('//') ? value : `/${locale}/dashboard`);

async function readJson(res) {
  return res.json().catch(() => ({}));
}

// Step 1 of signing in or registering: the backend replies with "enter the code we emailed you" (requiresOtp).
async function startAuth(path, input, formData) {
  const locale = safeLocale(formData.get('locale'));
  let res;
  try {
    res = await backendFetch(path, { method: 'POST', body: input });
  } catch {
    return { error: 'unreachable', values: input };
  }
  const body = await readJson(res);
  if (!res.ok) {
    const detail = body.details?.[0]?.msg || body.errors?.[0]?.msg;
    return { error: detail || body.error || 'Something went wrong. Please try again.', values: input };
  }
  if (body.requiresOtp) {
    return { step: 'otp', preAuthToken: body.preAuthToken, maskedEmail: body.maskedEmail, emailSent: body.emailSent !== false, values: { email: input.email } };
  }
  // No code needed: the backend already issued the login cookies.
  applyCookieLines(setCookieLines(res), await cookies());
  redirect(safeNext(formData.get('next'), locale));
}

export async function loginAction(_prev, formData) {
  const input = { email: formData.get('email') ?? '', password: formData.get('password') ?? '' };
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { errors: fieldErrors(parsed), values: { email: input.email } };
  return startAuth('/auth/login', parsed.data, formData);
}

export async function registerAction(_prev, formData) {
  const input = { email: formData.get('email') ?? '', username: formData.get('username') ?? '', password: formData.get('password') ?? '' };
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { errors: fieldErrors(parsed), values: { email: input.email, username: input.username } };
  return startAuth('/auth/register', parsed.data, formData);
}

// Step 2: the 6-digit code. On success the backend sets the login cookies, which are passed on to the browser here.
export async function verifyOtpAction(prev, formData) {
  const locale = safeLocale(formData.get('locale'));
  const parsed = otpSchema.safeParse({ otp: formData.get('otp') ?? '', preAuthToken: formData.get('preAuthToken') ?? '' });
  if (!parsed.success) return { ...prev, errors: fieldErrors(parsed), error: undefined };
  let res;
  try {
    res = await backendFetch('/auth/verify-otp', { method: 'POST', body: parsed.data });
  } catch {
    return { ...prev, error: 'unreachable', errors: {} };
  }
  const body = await readJson(res);
  if (!res.ok) return { ...prev, error: body.error || 'That code did not work. Check it and try again.', errors: {} };
  applyCookieLines(setCookieLines(res), await cookies());
  redirect(safeNext(formData.get('next'), locale));
}

export async function logoutAction(formData) {
  const locale = safeLocale(formData.get('locale'));
  const store = await cookies();
  const refresh = store.get('refreshToken')?.value;
  try {
    await backendFetch('/auth/logout', { method: 'POST', cookie: refresh ? `refreshToken=${refresh}` : undefined });
  } catch { /* the cookies are removed below either way */ }
  clearLoginCookies(store);
  redirect(`/${locale}/login`);
}
