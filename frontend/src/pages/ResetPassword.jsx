import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as api from '../api';
import AuthLayout from '../components/AuthLayout';
import { useToast } from '../context/ToastContext';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true); setError('');
    try {
      await api.auth.resetPassword(token, { password });
      toast('Password updated. Please sign in.', 'success');
      navigate('/login');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <AuthLayout>
      <form onSubmit={submit}>
        <h1>Choose a new password</h1>
        <p className="muted" style={{ marginBottom: 22 }}>Use at least 8 characters.</p>
        <div className="field">
          <label htmlFor="pw">New password</label>
          <input id="pw" className="input" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw2">Confirm password</label>
          <input id="pw2" className="input" type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'form-error' : undefined} />
        </div>
        {error && <div id="form-error" className="error-text" role="alert">{error}</div>}
        <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
        <p className="center" style={{ marginTop: 16 }}><Link to="/login" className="link">Back to sign in</Link></p>
      </form>
    </AuthLayout>
  );
}
