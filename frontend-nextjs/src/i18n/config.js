// Internationalization (INT257: Advanced Features). The language is the first part of the address: /en, /hi, /es.
export const locales = ['en', 'hi', 'es'];
export const defaultLocale = 'en';

export const localeNames = { en: 'English', hi: 'हिन्दी', es: 'Español' };

export const hasLocale = (value) => locales.includes(value);

// Pick the best supported language from an Accept-Language header such as "hi-IN,hi;q=0.9,en;q=0.8".
export function negotiateLocale(header) {
  const wanted = String(header || '')
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { lang: tag.toLowerCase().split('-')[0], q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  return wanted.find((w) => hasLocale(w.lang))?.lang ?? defaultLocale;
}
