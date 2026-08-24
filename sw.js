/* DrivePlayer service worker — offline app shell.
   Strategy:
   - App shell (same-origin): network-first, falling back to cache, so updates
     land immediately but the app still opens with no connection.
   - Google Fonts: cache-first with background revalidate (they never change).
   - Everything else cross-origin (Drive/YouTube APIs, media): untouched —
     media caching is handled by the app itself in IndexedDB. */

const CACHE = 'driveplayer-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  if (url.origin !== location.origin) {
    // Cache fonts so the UI renders offline; leave API/media requests alone
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      e.respondWith(
        caches.open(CACHE).then(async (c) => {
          const hit = await c.match(e.request);
          const net = fetch(e.request)
            .then((r) => { if (r && (r.ok || r.type === 'opaque')) c.put(e.request, r.clone()); return r; })
            .catch(() => hit);
          return hit || net;
        })
      );
    }
    return;
  }

  // Same-origin: network-first with cache fallback
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return r;
      })
      .catch(() =>
        caches.match(e.request, { ignoreSearch: true })
          .then((m) => m || caches.match('./index.html'))
      )
  );
});
