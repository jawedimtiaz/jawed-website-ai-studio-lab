const CACHE_NAME = 'jawed-pwa-v4';
const STATIC_ASSETS = [
  '/',
  '/about/',
  '/work/',
  '/notes/',
  '/tools/',
  '/contact/',
  '/privacy/',
  '/offline.html',
  '/manifest.json',
  '/favicon.svg',
  '/favicon.ico',
  '/assets/icons/pwa-192.png',
  '/assets/icons/pwa-512.png',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/pwa-maskable-512.png',
  '/assets/icons/pwa-192.svg',
  '/assets/icons/pwa-512.svg',
  '/pwa-192.png',
  '/pwa-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

const isDynamicRequest = (request) => {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return true;
  if (request.method !== 'GET') return true;
  if (url.pathname.startsWith('/api/')) return true;
  if (url.pathname === '/studio-hq' || url.pathname.startsWith('/studio-hq/')) return true;
  return false;
};

const networkFirstNavigation = async (request) => {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;

    const homeFallback = await caches.match('/');
    if (homeFallback) return homeFallback;

    const offlineFallback = await caches.match('/offline.html');
    if (offlineFallback) return offlineFallback;

    return Response.error();
  }
};

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  return cachedResponse || (await fetchPromise) || Response.error();
};

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (isDynamicRequest(request)) return;

  const url = new URL(request.url);

  // For HTML navigation requests, use network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // For static assets, icons, and bundles, use stale-while-revalidate
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/offline.html'
  ) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
