'use server';

// Server Actions for signing in, creating an account and signing out (INT257: Server Actions, Authentication).
// They run on the server, so passwords and codes go from the form to this server to the EchoSign backend, never through
// browser-side scripts. Each action validates its input with Zod, then passes the backend's login cookies on to the browser.
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { backendFetch } from '@/lib/backend';
import { applyCookieLines, clearLoginCookies, setCookieLines } from '@/lib/cookies';
import { hasLocale } from '@/i18n/config';
import { fieldErrors, forgotSchema, loginSchema, otpSchema, registerSchema, resetSchema } from '@/lib/validation';

// This site's own address, sent as the Origin of server-made requests so the backend links back to the right website.
async function siteOrigin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || (host && host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

const safeLocale = (value) => (hasLocale(value) ? value : 'en');
// Only allow going back to an address on this site ("/en/notes"), never to another website.
const safeNext = (value, locale) => (typeof value === 'string' && value.startsWith(`/${locale}/`) && !value.startsWith('//') ? value : `/${locale}/classroom`);

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
  const input = { email: formData.get('email') ?? '', username: formData.get('username') ?? '', password: formData.get('password') ?? '', confirm: formData.get('confirm') ?? '' };
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { errors: fieldErrors(parsed), values: { email: input.email, username: input.username } };
  const { confirm, ...body } = parsed.data; // the confirmation box is only for the browser: the backend gets email, username, password
  return startAuth('/auth/register', body, formData);
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

// Forgot password: the backend emails a reset link (it answers the same way whether or not the account exists).
export async function forgotPasswordAction(_prev, formData) {
  const parsed = forgotSchema.safeParse({ email: formData.get('email') ?? '' });
  if (!parsed.success) return { errors: fieldErrors(parsed) };
  let res;
  try {
    // The Origin header tells the backend which website the reset link should point to.
    res = await backendFetch('/auth/forgot-password', { method: 'POST', body: { email: parsed.data.email }, headers: { Origin: await siteOrigin() } });
  } catch {
    return { error: 'unreachable' };
  }
  if (!res.ok) {
    const body = await readJson(res);
    return { error: body.error || 'Something went wrong. Please try again.' };
  }
  return { sentTo: parsed.data.email };
}

// Reset password with the token from the emailed link.
export async function resetPasswordAction(_prev, formData) {
  const locale = safeLocale(formData.get('locale'));
  const token = String(formData.get('token') || '');
  const parsed = resetSchema.safeParse({ password: formData.get('password') ?? '', confirm: formData.get('confirm') ?? '' });
  if (!parsed.success) return { errors: fieldErrors(parsed) };
  let res;
  try {
    res = await backendFetch(`/auth/reset-password/${encodeURIComponent(token)}`, { method: 'POST', body: { password: parsed.data.password } });
  } catch {
    return { error: 'unreachable' };
  }
  if (!res.ok) {
    const body = await readJson(res);
    const detail = body.details?.[0]?.msg;
    return { error: detail || body.error || 'This reset link is not valid any more. Request a new one.' };
  }
  redirect(`/${locale}/login?reset=1`);
}
