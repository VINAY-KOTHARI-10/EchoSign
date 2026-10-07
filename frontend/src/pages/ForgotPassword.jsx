import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import AuthLayout from '../components/AuthLayout';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.auth.forgotPassword({ email });
      setSent(true);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <AuthLayout>
      {sent ? (
        <div role="status">
          <h1>Check your inbox</h1>
          <p className="muted" style={{ margin: '8px 0 20px' }}>If an account exists for {email}, a reset link is on its way.</p>
          <Link to="/login" className="btn btn-primary btn-block">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit}>
          <h1>Reset your password</h1>
          <p className="muted" style={{ marginBottom: 22 }}>Enter your email and we’ll send you a reset link.</p>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'form-error' : undefined} />
          </div>
          {error && <div id="form-error" className="error-text" role="alert">{error}</div>}
          <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          <p className="center" style={{ marginTop: 16 }}><Link to="/login" className="link">Back to sign in</Link></p>
        </form>
      )}
    </AuthLayout>
  );
}
