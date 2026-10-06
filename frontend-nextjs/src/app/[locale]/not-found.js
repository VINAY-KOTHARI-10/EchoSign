// Shown when notFound() is called or no page matches an address under /[locale].
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container section" id="content">
      <div className="state">
        <h2>404 · Page not found</h2>
        <p>We could not find what you were looking for.</p>
        <Link href="/" className="btn btn-primary btn-sm">Go to the home page</Link>
      </div>
    </main>
  );
}
