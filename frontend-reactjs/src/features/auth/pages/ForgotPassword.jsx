import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../../api';
import AuthLayout from '../components/AuthLayout';
import FieldError from '../components/FieldError';
import { fieldErrors, forgotSchema } from '../../../lib/schemas';

// An UNCONTROLLED form: the browser keeps the typed text in the input, and we read it with FormData when the form is
// submitted (no state update on every key press). Compare with the controlled forms on the sign-in and register pages.
export default function ForgotPassword() {
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errs, setErrs] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    const parsed = forgotSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    const found = fieldErrors(parsed);
    setErrs(found);
    if (!parsed.success) { setError(''); document.getElementById('email')?.focus(); return; }
    setBusy(true); setError('');
    try {
      await api.auth.forgotPassword({ email: parsed.data.email });
      setSentTo(parsed.data.email);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <AuthLayout>
      {sentTo ? (
        <div role="status">
          <h1>Check your inbox</h1>
          <p className="muted" style={{ margin: '8px 0 20px' }}>If an account exists for {sentTo}, a reset link is on its way.</p>
          <Link to="/login" className="btn btn-primary btn-block">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <h1>Reset your password</h1>
          <p className="muted" style={{ marginBottom: 22 }}>Enter your email and we’ll send you a reset link.</p>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" className="input" type="email" required autoComplete="email" defaultValue="" aria-invalid={Boolean(errs.email || error)} aria-describedby={errs.email ? 'email-err' : error ? 'form-error' : undefined} />
            <FieldError id="email-err" message={errs.email} />
          </div>
          {error && <div id="form-error" className="error-text" role="alert">{error}</div>}
          <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          <p className="center" style={{ marginTop: 16 }}><Link to="/login" className="link">Back to sign in</Link></p>
        </form>
      )}
    </AuthLayout>
  );
}
