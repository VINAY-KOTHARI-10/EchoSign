'use client';

// A password box with a lock icon and a show/hide (eye) button, the same as the EchoSign React site.
import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

export default function PasswordField({ id, name, value, onChange, placeholder, autoComplete = 'new-password', invalid = false, describedBy }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap input-wrap">
      <Lock className="lead" size={18} aria-hidden="true" />
      <input id={id} name={name} className="input has-icon" type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={onChange} placeholder={placeholder} aria-invalid={invalid || undefined} aria-describedby={describedBy} />
      <button type="button" className="pw-toggle" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
        {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  );
}
