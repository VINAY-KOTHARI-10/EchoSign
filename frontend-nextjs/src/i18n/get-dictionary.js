// The translated texts for one language, loaded only for that language (the other files are never sent).
import 'server-only';

const dictionaries = {
  en: () => import('./dictionaries/en.json').then((m) => m.default),
  hi: () => import('./dictionaries/hi.json').then((m) => m.default),
  es: () => import('./dictionaries/es.json').then((m) => m.default),
};

export const getDictionary = async (locale) => (dictionaries[locale] ?? dictionaries.en)();
