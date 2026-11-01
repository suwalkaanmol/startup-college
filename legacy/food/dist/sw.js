/**
 * Service Worker for UniHub Student App
 * Strict Caching Policy:
 * - API requests (/orders, /canteens, /menu, /health, /ws) are strictly NETWORK ONLY.
 * - Sensitive customer data and live stock are NEVER stored in cache.
 * - Navigation / HTML requests are NETWORK FIRST to ensure new deployments show immediately.
 * - Static shell assets (images, icons, fonts) are Stale-While-Revalidate.
 */

const CACHE_NAME = 'unihub-student-shell-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Pre-caching non-fatal error:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Service workers can observe extension-injected requests; Cache only supports HTTP(S).
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== self.location.origin) {
    return;
  }

  // 1. Bypass all REST API endpoints, image assets, and WebSocket handshakes completely (Network Only)
  if (
    url.pathname.startsWith('/orders') ||
    url.pathname.startsWith('/canteens') ||
    url.pathname.startsWith('/menu') ||
    url.pathname.startsWith('/static') ||
    url.pathname.startsWith('/health') ||
    url.pathname.startsWith('/ws') ||
    url.port === '8000' ||
    event.request.method !== 'GET'
  ) {
    return; // Direct network request
  }

  // 2. Navigation / HTML Document requests: Network-First
  // Ensures newly deployed versions on Vercel are immediately loaded, falling back to cache if offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Static shell assets: Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          event.waitUntil(
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseToCache))
              .catch((err) => console.warn('Static asset cache write failed:', err))
          );
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
