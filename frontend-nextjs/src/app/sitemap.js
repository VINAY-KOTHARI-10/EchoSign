// sitemap.xml (INT257: SEO fundamentals). Lists every public page in every language, so search engines find them all.
import { locales } from '@/i18n/config';
import { siteUrl } from '@/lib/site-url';
import { LETTER_KEYS } from '@/features/signs/data';

const SITE = siteUrl();
const PUBLIC_PATHS = ['', '/dictionary', '/languages', '/rendering', '/rendering/ssg', '/rendering/isr', '/rendering/ssr', '/rendering/csr', ...LETTER_KEYS.map((l) => `/dictionary/${l.toLowerCase()}`)];

export default function sitemap() {
  return locales.flatMap((locale) => PUBLIC_PATHS.map((path) => ({
    url: `${SITE}/${locale}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : path.startsWith('/dictionary/') ? 0.5 : 0.7,
    alternates: { languages: Object.fromEntries(locales.map((l) => [l, `${SITE}/${l}${path}`])) },
  })));
}
