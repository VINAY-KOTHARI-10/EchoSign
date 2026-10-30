// robots.txt: search engines may read the public pages but not the private area or the API.
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');

export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/*/dashboard', '/*/library', '/*/notes', '/*/admin', '/*/login', '/*/register'] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
