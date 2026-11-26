// Auth - login and registration screen
import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import * as api from '../../../api';
import { API_URL } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import AuthLayout from '../components/AuthLayout';
import PasswordMeter from '../components/PasswordMeter';
import PasswordField from '../components/PasswordField';
import FieldError from '../components/FieldError';
import { fieldErrors, loginSchema, registerSchema } from '../../../lib/schemas';

const OTP_LENGTH = 6;

function OtpStep({ preAuthToken, maskedEmail, emailSent = true, onDone }) {
  const toast = useToast();
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(emailSent); // false until a code has really been emailed
  const refs = useRef([]);

  const setDigit = (i, v) => {
    const d = v.replace(/\D/g, '').slice(-1);
    setDigits((prev) => prev.map((x, idx) => (idx === i ? d : x)));
    if (d && i < OTP_LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const onPaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!text) return;
    e.preventDefault();
    setDigits(Array.from({ length: OTP_LENGTH }, (_, i) => text[i] || ''));
    refs.current[Math.min(text.length, OTP_LENGTH - 1)]?.focus();
  };

  const submit = async (e) => {
    e.preventDefault();
    const otp = digits.join('');
    if (otp.length !== OTP_LENGTH) return setError('Enter all 6 digits of the code.');
    setBusy(true); setError('');
    try {
      await api.auth.verifyOtp({ preAuthToken, otp });
      await onDone();
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  const resend = async () => {
    try {
      await api.auth.resendOtp({ preAuthToken });
      setSent(true); setError('');
      toast('A new code is on its way', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <form onSubmit={submit} noValidate>
      <h1>Check your email</h1>
      {sent
        ? <p className="muted" id="otp-help">We sent a 6-digit code to <b>{maskedEmail}</b>.</p>
        : <p className="notice" id="otp-help" role="alert"><span>We couldn’t email a code to <b>{maskedEmail}</b>. Press “Resend code” to try again.</span></p>}
      <div className="otp-row" onPaste={onPaste} role="group" aria-label="6-digit verification code" aria-describedby="otp-help">
        {digits.map((d, i) => (
          <input
            key={i} ref={(el) => (refs.current[i] = el)} value={d} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={1} autoFocus={i === 0} aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
            onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => onKeyDown(i, e)}
          />
        ))}
      </div>
      {error && <div className="error-text" role="alert" style={{ justifyContent: 'center' }}>{error}</div>}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
      <button type="button" className="btn btn-ghost btn-block" onClick={resend} style={{ marginTop: 8 }}>Resend code</button>
    </form>
  );
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" /><path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.100 0 24s.9 7.600 2.6 10.800l7.9-6.100z" /><path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.500-5.800c-2.100 1.400-4.800 2.300-8.400 2.300-6.300 0-11.600-4-13.500-9.800l-7.900 6.100C6.500 42.600 14.600 48 24 48z" /></svg>
  );
}

export default function Auth({ mode }) {
  const { establishSession } = useAuth();
  const isRegister = mode === 'register';
  const { state } = useLocation(); // carries `from` so login <-> register keeps the return path
  const [form, setForm] = useState({ email: '', username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState(null);
  const [fieldErrs, setFieldErrs] = useState({}); // Zod messages per field

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setFieldErrs((x) => ({ ...x, [k]: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    // Check the form with its Zod schema before asking the server; show each message under its field.
    const parsed = (isRegister ? registerSchema : loginSchema).safeParse({ ...form, confirm });
    const errs = fieldErrors(parsed);
    setFieldErrs(errs);
    if (!parsed.success) {
      setError('');
      const first = ['email', 'username', 'password', 'confirm'].find((k) => errs[k]);
      if (first) document.getElementById(first)?.focus();
      return;
    }
    setBusy(true); setError('');
    try {
      const res = isRegister
        ? await api.auth.register(form)
        : await api.auth.login({ email: form.email, password: form.password });
      if (res.requiresOtp) {
        setOtp({ preAuthToken: res.preAuthToken, maskedEmail: res.maskedEmail, emailSent: res.emailSent !== false });
      } else {
        await establishSession();
      }
    } catch (err) {
      setError(err.details?.[0]?.msg || err.message);
    } finally { setBusy(false); }
  };

  return (
    <AuthLayout>
      {otp ? (
        <OtpStep {...otp} onDone={establishSession} />
      ) : (
        <form onSubmit={submit} noValidate>
          <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
          <p className="muted" style={{ marginBottom: 22 }}>
            {isRegister ? 'Start captioning your classroom today.' : 'Sign in to continue to your classroom.'}
          </p>

          <div className="field">
            <label htmlFor="email">Email</label>
            <div className="input-wrap"><Mail className="lead" size={18} aria-hidden="true" /><input id="email" className="input has-icon" type="email" required autoComplete="email" value={form.email} onChange={set('email')} placeholder="you@school.edu" aria-invalid={Boolean(fieldErrs.email || error)} aria-describedby={fieldErrs.email ? 'email-err' : error ? 'form-error' : undefined} /></div>
            <FieldError id="email-err" message={fieldErrs.email} />
          </div>
          {isRegister && (
            <div className="field">
              <label htmlFor="username">Username</label>
              <div className="input-wrap"><User className="lead" size={18} aria-hidden="true" /><input id="username" className="input has-icon" required minLength={3} maxLength={20} autoComplete="username" value={form.username} onChange={set('username')} placeholder="3–20 characters" aria-invalid={Boolean(fieldErrs.username)} aria-describedby={fieldErrs.username ? 'username-err' : undefined} /></div>
              <FieldError id="username-err" message={fieldErrs.username} />
            </div>
          )}
          <div className={isRegister ? 'pw-pair' : undefined}>
          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="pw-wrap input-wrap">
<Lock className="lead" size={18} aria-hidden="true" /><input id="password" className="input has-icon" type={showPw ? 'text' : 'password'} required minLength={isRegister ? 8 : 1} autoComplete={isRegister ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} placeholder={isRegister ? '8+ characters' : 'Your password'} aria-invalid={Boolean(fieldErrs.password)} aria-describedby={fieldErrs.password ? 'password-err' : undefined} />
              <button type="button" className="pw-toggle" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}>
                {showPw ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
            <FieldError id="password-err" message={fieldErrs.password} />
          </div>
          {isRegister && (
            <div className="field">
              <label htmlFor="confirm">Confirm password</label>
              <PasswordField id="confirm" value={confirm} onChange={(e) => { setConfirm(e.target.value); setFieldErrs((x) => ({ ...x, confirm: undefined })); }} placeholder="Repeat it" invalid={Boolean(fieldErrs.confirm) || (Boolean(confirm) && confirm !== form.password)} describedBy={fieldErrs.confirm ? 'confirm-err' : undefined} />
              <FieldError id="confirm-err" message={fieldErrs.confirm} />
              {Boolean(confirm) && !fieldErrs.confirm && <span className={`hint ${confirm === form.password ? 'okc' : 'err'}`} role="status">{confirm === form.password ? 'Passwords match.' : 'The passwords do not match yet.'}</span>}
            </div>
          )}
          </div>
          {isRegister && <PasswordMeter password={form.password} email={form.email} />}

          {!isRegister && <div className="auth-forgot"><Link to="/forgot-password" className="link">Forgot password?</Link></div>}
          {error && <div id="form-error" className="error-text" role="alert">{error}</div>}
          <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}{!busy && <ArrowRight size={18} aria-hidden="true" />}
          </button>

          <div className="divider">or continue with</div>
          <a className="btn btn-outline btn-block" href={`${API_URL}/auth/google?origin=${encodeURIComponent(window.location.origin)}`}><GoogleMark /> Continue with Google</a>

          <p className="center muted" style={{ marginTop: 20, fontSize: 14 }}>
            {isRegister ? 'Already have an account?' : 'New to EchoSign?'}{' '}
            <Link to={isRegister ? '/login' : '/register'} state={state} className="link">{isRegister ? 'Sign in' : 'Create an account'}</Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}

