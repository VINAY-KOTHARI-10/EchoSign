// robots.txt: search engines may read the public pages but not the private area or the API.
import { siteUrl } from '@/lib/site-url';

const SITE = siteUrl();

export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/*/classroom', '/*/overview', '/*/lectures', '/*/library', '/*/notes', '/*/admin', '/*/login', '/*/register'] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
