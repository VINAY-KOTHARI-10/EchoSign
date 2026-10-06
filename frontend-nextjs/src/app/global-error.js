'use client';

// The last safety net: used when even the root layout fails. It must provide its own <html> and <body>.
export default function GlobalError({ reset }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '6rem 1rem' }}>
        <h1>Something went wrong</h1>
        <p>The site hit an unexpected problem.</p>
        <button type="button" onClick={reset} style={{ padding: '0.75rem 1.5rem', borderRadius: 999, border: 0, background: '#5b3df5', color: '#fff', fontWeight: 700 }}>Try again</button>
      </body>
    </html>
  );
}
