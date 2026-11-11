// Auth - login and registration screen
import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Info, Lock, Mail, User } from 'lucide-react';
import * as api from '../api';
import { API_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import AuthLayout from '../components/AuthLayout';

const OTP_LENGTH = 6;

function OtpStep({ preAuthToken, maskedEmail, onDone }) {
  const toast = useToast();
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
      toast('A new code is on its way', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <form onSubmit={submit} noValidate>
      <h1>Check your email</h1>
      <p className="muted" id="otp-help">We sent a 6-digit code to <b>{maskedEmail}</b>.</p>
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
  const [otp, setOtp] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = isRegister
        ? await api.auth.register(form)
        : await api.auth.login({ email: form.email, password: form.password });
      if (res.requiresOtp) {
        setOtp({ preAuthToken: res.preAuthToken, maskedEmail: res.maskedEmail });
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
        <form onSubmit={submit}>
          <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
          <p className="muted" style={{ marginBottom: 22 }}>
            {isRegister ? 'Start captioning your classroom today.' : 'Sign in to continue to your classroom.'}
          </p>

          <div className="field">
            <label htmlFor="email">Email</label>
            <div className="input-wrap"><Mail className="lead" size={18} aria-hidden="true" /><input id="email" className="input has-icon" type="email" required autoComplete="email" value={form.email} onChange={set('email')} placeholder="you@school.edu" aria-invalid={Boolean(error)} aria-describedby={error ? 'form-error' : undefined} /></div>
          </div>
          {isRegister && (
            <div className="field">
              <label htmlFor="username">Username</label>
              <div className="input-wrap"><User className="lead" size={18} aria-hidden="true" /><input id="username" className="input has-icon" required minLength={3} maxLength={20} autoComplete="username" value={form.username} onChange={set('username')} placeholder="3–20 characters" aria-describedby="username-hint" /></div>
              <span id="username-hint" className="hint">Shown next to your captions and in chat.</span>
            </div>
          )}
          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="pw-wrap input-wrap">
              <Lock className="lead" size={18} aria-hidden="true" />
              <input id="password" className="input has-icon" type={showPw ? 'text' : 'password'} required minLength={isRegister ? 8 : 1} autoComplete={isRegister ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} placeholder={isRegister ? 'At least 8 characters' : 'Your password'} aria-describedby={isRegister ? 'pw-hint' : undefined} />
              <button type="button" className="pw-toggle" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}>
                {showPw ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
            {isRegister && <span id="pw-hint" className="hint">Use at least 8 characters.</span>}
          </div>

          {isRegister && <p className="auth-note"><Info size={18} aria-hidden="true" /><span>New accounts start as Members and can join classes. An administrator can make you a Teacher so you can start them.</span></p>}
          {error && <div id="form-error" className="error-text" role="alert">{error}</div>}
          <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}{!busy && <ArrowRight size={18} aria-hidden="true" />}
          </button>

          {!isRegister && (
            <div className="center" style={{ marginTop: 12 }}>
              <Link to="/forgot-password" className="link">Forgot password?</Link>
            </div>
          )}

          <div className="divider">or</div>
          <a className="btn btn-outline btn-block" href={`${API_URL}/auth/google`}><GoogleMark /> Continue with Google</a>

          <p className="center muted" style={{ marginTop: 20, fontSize: 14 }}>
            {isRegister ? 'Already have an account?' : 'New to EchoSign?'}{' '}
            <Link to={isRegister ? '/login' : '/register'} state={state} className="link">{isRegister ? 'Sign in' : 'Create an account'}</Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}

