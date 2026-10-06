// Shown when forbidden() is called (signed in, but the role is not allowed). Needs experimental.authInterrupts in next.config.mjs.
import Link from 'next/link';

export default function Forbidden() {
  return (
    <main className="container section" id="content">
      <div className="state">
        <h2>403 · You do not have access</h2>
        <p>This page is only for accounts with a different role.</p>
        <Link href="/" className="btn btn-primary btn-sm">Go to the home page</Link>
      </div>
    </main>
  );
}
