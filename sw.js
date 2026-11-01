// UniHub service worker. It only handles the hub's own files; module pages (and their own
// service workers) and every /api request go straight to the network.
const CACHE = 'unihub-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'hub/web/theme.css', 'hub/web/hub.css', 'hub/web/app.js',
  'hub/web/sync.js', 'hub/web/icon.svg', 'hub/web/icon-192.png', 'nav/index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('unihub-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  const rel = url.pathname.slice(scope.length);
  const ours = rel === '' || rel === 'index.html' || rel === 'manifest.webmanifest' || rel.startsWith('hub/web/') || rel.startsWith('nav/');
  if (!ours || rel.startsWith('api/')) return;
  // Network first so updates land straight away; the cache covers a weak or missing connection.
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});
