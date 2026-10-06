'use client';

// Error UI: shown when something below this segment throws. It must be a Client Component (it has a retry button).
// The error itself is also logged on the server by instrumentation.js.
import { useEffect } from 'react';
import { XCircle } from 'lucide-react';

export default function Error({ error, reset }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="container section" id="content">
      <div className="state" role="alert">
        <div className="state-icon" style={{ background: '#fdeceb', color: 'var(--stop)' }} aria-hidden="true"><XCircle size={26} /></div>
        <h2>Something went wrong</h2>
        <p>This page could not be shown. You can try again.</p>
        {error?.digest && <p className="mono muted" style={{ fontSize: 12 }}>Reference: {error.digest}</p>}
        <button type="button" onClick={reset} className="btn btn-primary btn-sm">Try again</button>
      </div>
    </main>
  );
}
