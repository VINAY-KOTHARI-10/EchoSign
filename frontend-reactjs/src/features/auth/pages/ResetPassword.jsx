import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as api from '../../../api';
import AuthLayout from '../components/AuthLayout';
import PasswordMeter from '../components/PasswordMeter';
import PasswordField from '../components/PasswordField';
import FieldError from '../components/FieldError';
import { fieldErrors, resetSchema } from '../../../lib/schemas';
import { useToast } from '../../../context/ToastContext';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errs, setErrs] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    const parsed = resetSchema.safeParse({ password, confirm });
    const found = fieldErrors(parsed);
    setErrs(found);
    if (!parsed.success) { setError(''); document.getElementById(found.password ? 'pw' : 'pw2')?.focus(); return; }
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
      <form onSubmit={submit} noValidate>
        <h1>Choose a new password</h1>
        <p className="muted" style={{ marginBottom: 22 }}>Use at least 8 characters, with a letter and a number.</p>
        <div className="field">
          <label htmlFor="pw">New password</label>
          <PasswordField id="pw" value={password} onChange={(e) => { setPassword(e.target.value); setErrs((x) => ({ ...x, password: undefined })); }} invalid={Boolean(errs.password)} describedBy={errs.password ? 'pw-err' : undefined} />
          <FieldError id="pw-err" message={errs.password} />
          <PasswordMeter password={password} />
        </div>
        <div className="field">
          <label htmlFor="pw2">Confirm password</label>
          <PasswordField id="pw2" value={confirm} onChange={(e) => { setConfirm(e.target.value); setErrs((x) => ({ ...x, confirm: undefined })); }} invalid={Boolean(errs.confirm) || (Boolean(confirm) && confirm !== password)} describedBy={errs.confirm ? 'pw2-err' : undefined} />
          <FieldError id="pw2-err" message={errs.confirm} />
        </div>
        {error && <div id="form-error" className="error-text" role="alert">{error}</div>}
        <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
        <p className="center" style={{ marginTop: 16 }}><Link to="/login" className="link">Back to sign in</Link></p>
      </form>
    </AuthLayout>
  );
}
