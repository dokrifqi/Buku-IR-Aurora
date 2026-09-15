const CACHE_NAME = 'aurora-ir-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './data/entries.json',
  './data/categories.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // 1. cache app shell first (fast, small)
    await cache.addAll(SHELL_FILES);

    // 2. cache every image referenced in entries.json so notes work offline
    try {
      const res = await fetch('./data/entries.json');
      const entries = await res.json();
      const imgUrls = [];
      entries.forEach(e => (e.images || []).forEach(f => imgUrls.push('./img/' + f)));
      // fetch & cache in small batches so we don't overwhelm the connection
      const batchSize = 12;
      for (let i = 0; i < imgUrls.length; i += batchSize) {
        const batch = imgUrls.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(async (url) => {
          try {
            const r = await fetch(url);
            if (r.ok) await cache.put(url, r);
          } catch (e) { /* skip failed image, non-fatal */ }
        }));
      }
    } catch (e) { /* entries.json fetch failed, shell still cached */ }

    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) {
      // refresh cache in background when online (stale-while-revalidate)
      fetch(event.request).then(res => {
        if (res && res.ok) caches.open(CACHE_NAME).then(c => c.put(event.request, res));
      }).catch(() => {});
      return cached;
    }
    try {
      const res = await fetch(event.request);
      if (res && res.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, res.clone());
      }
      return res;
    } catch (e) {
      // offline and not cached - fall back to index for navigations
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
      throw e;
    }
  })());
});
