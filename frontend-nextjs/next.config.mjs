// Next.js configuration (INT257: Fundamentals, Deployment, Industry practices).
const backend = (process.env.BACKEND_URL || '').replace(/\/+$/, '');

// Security headers sent with every response (Industry practices: security best practices).
// Only directives that cannot break Next.js itself are used here: no inline-script rules.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false, // do not advertise the framework
  reactStrictMode: true,
  // Enables forbidden() / unauthorized() and the forbidden.js / unauthorized.js pages (role-based access control).
  experimental: { authInterrupts: true },
  images: { formats: ['image/avif', 'image/webp'] }, // Image optimisation
  // The copied EchoSign React pages import their router from 'react-router-dom'; this maps that name to an adapter built on Next.js routing.
  turbopack: { resolveAlias: { 'react-router-dom': './src/react-app/shims/react-router-dom.js' } },
  async rewrites() {
    // The browser talks to this site only. Calls to /api/v1/* are forwarded to the EchoSign backend on Render, so the
    // login cookies stay first-party and Google sign-in can come back to this site.
    return backend ? [{ source: '/api/v1/:path*', destination: `${backend}/api/v1/:path*` }] : [];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
