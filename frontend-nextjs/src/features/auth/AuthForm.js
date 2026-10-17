'use client';

// The sign-in / create-account form. A Client Component because it uses useActionState (form state returned by a
// Server Action) and shows the pending state while the action runs. With JavaScript off, the form still submits.
// Same markup and classes as the form in the EchoSign React app.
import { useActionState } from 'react';
import Link from 'next/link';
import { ArrowRight, Lock, Mail, User } from 'lucide-react';
import { loginAction, registerAction, verifyOtpAction } from '@/features/auth/actions';

function FieldError({ id, message }) {
  return message ? <span id={id} className="hint err" role="alert">{message}</span> : null;
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

  if (state.step === 'otp') return <OtpStep locale={locale} next={next} dict={dict} state={state} />;

  const errors = state.errors || {};
  return (
    <form action={action} noValidate>
      <h1>{isRegister ? dict.auth.registerTitle : dict.auth.loginTitle}</h1>
      <p className="muted" style={{ marginBottom: 22 }}>{isRegister ? dict.auth.registerSub : dict.auth.loginSub}</p>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next || ''} />

      <div className="field">
        <label htmlFor="email">{dict.auth.email}</label>
        <div className="input-wrap"><Mail className="lead" size={18} aria-hidden="true" /><input id="email" name="email" type="email" className="input has-icon" autoComplete="email" defaultValue={state.values?.email ?? ''} placeholder="you@school.edu" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-err' : undefined} /></div>
        <FieldError id="email-err" message={errors.email} />
      </div>

      {isRegister && (
        <div className="field">
          <label htmlFor="username">{dict.auth.username}</label>
          <div className="input-wrap"><User className="lead" size={18} aria-hidden="true" /><input id="username" name="username" className="input has-icon" autoComplete="username" defaultValue={state.values?.username ?? ''} placeholder="3–20 characters" aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? 'username-err' : undefined} /></div>
          <FieldError id="username-err" message={errors.username} />
        </div>
      )}

      <div className="field">
        <label htmlFor="password">{dict.auth.password}</label>
        <div className="input-wrap"><Lock className="lead" size={18} aria-hidden="true" /><input id="password" name="password" type="password" className="input has-icon" autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder={isRegister ? '8+ characters' : 'Your password'} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-err' : undefined} /></div>
        <FieldError id="password-err" message={errors.password} />
      </div>

      {state.error && <div className="error-text" role="alert">{state.error === 'unreachable' ? dict.common.backendDown : state.error}</div>}

      <button className="btn btn-primary btn-block btn-lg" disabled={pending}>
        {pending ? dict.auth.working : isRegister ? dict.auth.createAccount : dict.auth.signIn}{!pending && <ArrowRight size={18} aria-hidden="true" />}
      </button>

      <p className="center muted" style={{ marginTop: 20, fontSize: 14 }}>
        {isRegister ? dict.auth.haveAccount : dict.auth.noAccount}{' '}
        <Link href={`/${locale}/${isRegister ? 'login' : 'register'}${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="link">
          {isRegister ? dict.auth.signIn : dict.auth.createAccount}
        </Link>
      </p>
    </form>
  );
}
