// Minimal offline support for the xerox module: caches only its own app shell.
// API, auth and file requests always go to the network. Only this module's caches are ever deleted.
const C = 'xerox-shell-v3';
self.addEventListener('install', (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(['./', './icon.svg'])).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith('xerox-shell') && x !== C).map((x) => caches.delete(x)))).then(() => clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(C).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match('./'))));
});
