// Reading fonts for captions are only downloaded when someone actually chooses them.
const SOURCES = {
  lexend: 'https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;700&display=swap',
  atkinson: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap',
};
const added = new Set();

export function ensureFont(id) {
  const href = SOURCES[id];
  if (!href || added.has(id) || typeof document === 'undefined') return false;
  added.add(id);
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = href; link.dataset.font = id;
  document.head.appendChild(link);
  return true;
}
