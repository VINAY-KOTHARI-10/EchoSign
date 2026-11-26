'use client';

// The sign-in / create-account form: the same markup, classes and fields as the EchoSign React site
// (email, username, password with an eye button, confirm password and strength meter on sign-up, forgot-password link,
// "Continue with Google"). A Client Component because it uses useActionState (form state returned by a Server Action).
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Mail, User } from 'lucide-react';
import { loginAction, registerAction, verifyOtpAction } from '@/features/auth/actions';
import PasswordField from '@/components/PasswordField';
import PasswordMeter from '@/components/PasswordMeter';

function FieldError({ id, message }) {
  return message ? <span id={id} className="hint err" role="alert">{message}</span> : null;
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" /><path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>
  );
}

function OtpStep({ locale, next, dict, state }) {
  const [otpState, action, pending] = useActionState(verifyOtpAction, state);
  return (
    <form action={action} noValidate>
      <h1>{dict.auth.codeTitle}</h1>
      <p className="muted" style={{ marginBottom: 22 }}>{dict.auth.codeSub} <b>{state.maskedEmail}</b></p>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next || ''} />
      <input type="hidden" name="preAuthToken" value={state.preAuthToken} />
      <div className="field">
        <label htmlFor="otp">{dict.auth.code}</label>
        <input id="otp" name="otp" className="input mono code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus aria-invalid={Boolean(otpState.errors?.otp)} aria-describedby={otpState.errors?.otp ? 'otp-err' : undefined} />
        <FieldError id="otp-err" message={otpState.errors?.otp} />
      </div>
      {otpState.error && <div className="error-text" role="alert">{otpState.error === 'unreachable' ? dict.common.backendDown : otpState.error}</div>}
      <button className="btn btn-primary btn-block btn-lg" disabled={pending}>{pending ? dict.auth.working : dict.auth.verify}</button>
    </form>
  );
}

export default function AuthForm({ mode, locale, next, dict }) {
  const isRegister = mode === 'register';
  const [state, action, pending] = useActionState(isRegister ? registerAction : loginAction, {});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  if (state.step === 'otp') return <OtpStep locale={locale} next={next} dict={dict} state={state} />;

  const errors = state.errors || {};
  const googleHref = (el) => { el.href = `/api/v1/auth/google?origin=${encodeURIComponent(window.location.origin)}`; };

  return (
    <form action={action} noValidate>
      <h1>{isRegister ? dict.auth.registerTitle : dict.auth.loginTitle}</h1>
      <p className="muted" style={{ marginBottom: 22 }}>{isRegister ? dict.auth.registerSub : dict.auth.loginSub}</p>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next || ''} />

      <div className="field">
        <label htmlFor="email">{dict.auth.email}</label>
        <div className="input-wrap"><Mail className="lead" size={18} aria-hidden="true" /><input id="email" name="email" type="email" className="input has-icon" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-err' : undefined} /></div>
        <FieldError id="email-err" message={errors.email} />
      </div>

      {isRegister && (
        <div className="field">
          <label htmlFor="username">{dict.auth.username}</label>
          <div className="input-wrap"><User className="lead" size={18} aria-hidden="true" /><input id="username" name="username" className="input has-icon" autoComplete="username" defaultValue={state.values?.username ?? ''} placeholder="3–20 characters" aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? 'username-err' : undefined} /></div>
          <FieldError id="username-err" message={errors.username} />
        </div>
      )}

      <div className={isRegister ? 'pw-pair' : undefined}>
        <div className="field">
          <label htmlFor="password">{dict.auth.password}</label>
          <PasswordField id="password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder={isRegister ? '8+ characters' : 'Your password'} invalid={Boolean(errors.password)} describedBy={errors.password ? 'password-err' : undefined} />
          <FieldError id="password-err" message={errors.password} />
        </div>
        {isRegister && (
          <div className="field">
            <label htmlFor="confirm">{dict.auth.confirm}</label>
            <PasswordField id="confirm" name="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={dict.auth.repeat} invalid={Boolean(errors.confirm) || (Boolean(confirm) && confirm !== password)} describedBy={errors.confirm ? 'confirm-err' : undefined} />
            <FieldError id="confirm-err" message={errors.confirm} />
            {Boolean(confirm) && !errors.confirm && <span className={`hint ${confirm === password ? 'okc' : 'err'}`} role="status">{confirm === password ? dict.auth.passwordsMatch : dict.auth.passwordsDiffer}</span>}
          </div>
        )}
      </div>
      {isRegister && <PasswordMeter password={password} email={email} />}

      {!isRegister && <div className="auth-forgot"><Link href={`/${locale}/forgot-password`} className="link">{dict.auth.forgot}</Link></div>}
      {state.error && <div className="error-text" role="alert">{state.error === 'unreachable' ? dict.common.backendDown : state.error}</div>}

      <button className="btn btn-primary btn-block btn-lg" disabled={pending}>
        {pending ? dict.auth.working : isRegister ? dict.auth.createAccount : dict.auth.signIn}{!pending && <ArrowRight size={18} aria-hidden="true" />}
      </button>

      <div className="divider">{dict.auth.orContinue}</div>
      <a className="btn btn-outline btn-block" href="/api/v1/auth/google" onClick={(e) => googleHref(e.currentTarget)}><GoogleMark /> {dict.auth.google}</a>

      <p className="center muted" style={{ marginTop: 20, fontSize: 14 }}>
        {isRegister ? dict.auth.haveAccount : dict.auth.noAccount}{' '}
        <Link href={`/${locale}/${isRegister ? 'login' : 'register'}${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="link">
          {isRegister ? dict.auth.signIn : dict.auth.createAccount}
        </Link>
      </p>
    </form>
  );
}
