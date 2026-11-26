// This site's public address, used for the sitemap, share previews and canonical links.
// Nothing needs to be set on Vercel: Vercel provides VERCEL_PROJECT_PRODUCTION_URL by itself. NEXT_PUBLIC_SITE_URL is only
// needed to override it (for example with a custom domain), and locally it falls back to http://localhost:3000.
export function siteUrl() {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  return 'http://localhost:3000';
}
