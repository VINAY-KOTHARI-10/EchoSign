// EchoSign service worker.
//  * Caches the app shell, so the app opens (and shows the offline notice) without a network.
//  * Keeps the lecture library list and each lecture's saved notes, so they can be read offline.
//  * Never caches live data (captions, chat, sockets, auth): a classroom needs a connection and says so.
//  * Cached notes are removed when the person signs out (message CLEAR_USER_CACHE).
const VERSION = 'v1';
const SHELL = `echosign-shell-${VERSION}`;
const DATA = 'echosign-data';
const SHELL_URLS = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png'];

// API GETs that are safe and useful to keep for offline reading.
const OFFLINE_API = [/^\/api\/v1\/classrooms\/attended(\?.*)?$/, /^\/api\/v1\/classrooms\/[A-Za-z0-9]+\/summary$/];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => Promise.allSettled(SHELL_URLS.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('echosign-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_USER_CACHE') event.waitUntil(caches.delete(DATA));
});

const networkFirst = async (request, cacheName, fallbackUrl) => {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request) || (fallbackUrl && await (await caches.open(SHELL)).match(fallbackUrl));
    if (hit) return hit;
    throw err;
  }
};

const cacheFirst = async (request) => {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/socket.io')) return;

  if (url.pathname.startsWith('/api/')) {
    if (OFFLINE_API.some((re) => re.test(url.pathname + url.search))) event.respondWith(networkFirst(request, DATA));
    return; // everything else goes straight to the network
  }
  if (request.mode === 'navigate') { event.respondWith(networkFirst(request, SHELL, '/')); return; }
  if (url.pathname.startsWith('/assets/')) { event.respondWith(cacheFirst(request)); return; }
  if (/\.(png|svg|webmanifest|ico)$/.test(url.pathname)) event.respondWith(cacheFirst(request));
});
