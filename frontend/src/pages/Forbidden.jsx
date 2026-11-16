import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../lib';

// Shown instead of a silent redirect when someone opens a page their role does not allow.
export default function Forbidden({ need = 'a higher' }) {
  const { user } = useAuth();
  return (
    <main className="card center forbidden" style={{ maxWidth: 520, margin: '12vh auto', padding: 32 }} role="alert">
      <div className="empty-icon" aria-hidden="true"><ShieldAlert size={34} /></div>
      <h1 style={{ fontSize: 26, marginTop: 8 }}>403: You don’t have access</h1>
      <p className="muted" style={{ margin: '10px 0 6px' }}>
        This page needs the <b>{need}</b> role. You are signed in as <b>{roleLabel(user?.role)}</b>.
      </p>
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>If you think this is a mistake, ask an administrator to change your role.</p>
      <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
        <Link to="/classroom" className="btn btn-primary">Back to classroom</Link>
        <Link to="/access" className="btn btn-outline">See what my role can do</Link>
      </div>
    </main>
  );
}
