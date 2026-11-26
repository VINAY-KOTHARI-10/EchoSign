'use client';

// The "forgot password" and "choose a new password" forms: the same markup and classes as the EchoSign React site.
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { forgotPasswordAction, resetPasswordAction } from '@/features/auth/actions';
import PasswordField from '@/components/PasswordField';
import PasswordMeter from '@/components/PasswordMeter';

function FieldError({ id, message }) {
  return message ? <span id={id} className="hint err" role="alert">{message}</span> : null;
}

export function ForgotForm({ locale, dict }) {
  const [state, action, pending] = useActionState(forgotPasswordAction, {});
  const errors = state.errors || {};

  if (state.sentTo) {
    return (
      <div role="status">
        <h1>{dict.auth.checkInbox}</h1>
        <p className="muted" style={{ margin: '8px 0 20px' }}>{dict.auth.resetSent.replace('{email}', state.sentTo)}</p>
        <Link href={`/${locale}/login`} className="btn btn-primary btn-block">{dict.auth.backSignIn}</Link>
      </div>
    );
  }
  return (
    <form action={action} noValidate>
      <h1>{dict.auth.forgotTitle}</h1>
      <p className="muted" style={{ marginBottom: 22 }}>{dict.auth.forgotSub}</p>
      <div className="field">
        <label htmlFor="email">{dict.auth.email}</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" aria-invalid={Boolean(errors.email || state.error)} aria-describedby={errors.email ? 'email-err' : state.error ? 'form-error' : undefined} />
        <FieldError id="email-err" message={errors.email} />
      </div>
      {state.error && <div id="form-error" className="error-text" role="alert">{state.error === 'unreachable' ? dict.common.backendDown : state.error}</div>}
      <button className="btn btn-primary btn-block btn-lg" disabled={pending}>{pending ? dict.auth.sending : dict.auth.sendLink}</button>
      <p className="center" style={{ marginTop: 16 }}><Link href={`/${locale}/login`} className="link">{dict.auth.backSignIn}</Link></p>
    </form>
  );
}

export function ResetForm({ locale, token, dict }) {
  const [state, action, pending] = useActionState(resetPasswordAction, {});
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const errors = state.errors || {};
  return (
    <form action={action} noValidate>
      <h1>{dict.auth.resetTitle}</h1>
      <p className="muted" style={{ marginBottom: 22 }}>{dict.auth.resetSub}</p>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label htmlFor="pw">{dict.auth.newPassword}</label>
        <PasswordField id="pw" name="password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={Boolean(errors.password)} describedBy={errors.password ? 'pw-err' : undefined} />
        <FieldError id="pw-err" message={errors.password} />
        <PasswordMeter password={password} />
      </div>
      <div className="field">
        <label htmlFor="pw2">{dict.auth.confirm}</label>
        <PasswordField id="pw2" name="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={Boolean(errors.confirm) || (Boolean(confirm) && confirm !== password)} describedBy={errors.confirm ? 'pw2-err' : undefined} />
        <FieldError id="pw2-err" message={errors.confirm} />
      </div>
      {state.error && <div id="form-error" className="error-text" role="alert">{state.error === 'unreachable' ? dict.common.backendDown : state.error}</div>}
      <button className="btn btn-primary btn-block btn-lg" disabled={pending}>{pending ? dict.auth.saving : dict.auth.updatePassword}</button>
      <p className="center" style={{ marginTop: 16 }}><Link href={`/${locale}/login`} className="link">{dict.auth.backSignIn}</Link></p>
    </form>
  );
}
