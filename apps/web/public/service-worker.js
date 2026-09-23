const CACHE = 'booking-platform-v1';
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/','/manifest.webmanifest','/app-icon.svg']))));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const cacheable = url.pathname === '/' || url.pathname.startsWith('/assets/') || url.pathname === '/manifest.webmanifest' || url.pathname === '/app-icon.svg';
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !cacheable) return;
  event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); void caches.open(CACHE).then((cache) => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request)));
});
