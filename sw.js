const CACHE     = 'väder-v14';
const CACHE_API = 'väder-v14-api';
const STATIC    = ['.', './index.html', './app.js', './sw.js', './manifest.json', './icons/icon.svg'];

// ── Install – pre-cache static shell ──────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC))
  );
});

// ── Activate – purge old caches ────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== CACHE_API)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Same-origin static assets → cache-first
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(hit =>
        hit || fetch(e.request).then(res => {
          if (res.ok) {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          }
          return res;
        })
      )
    );
    return;
  }

  // External weather / geocoding APIs → network-first, cache fallback
  if (
    url.hostname.includes('open-meteo') ||
    url.hostname.includes('met.no')     ||
    url.hostname.includes('smhi.se')    ||
    url.hostname.includes('nominatim')
  ) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            caches.open(CACHE_API).then(c => c.put(e.request, res.clone()));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(e.request);
          return cached || new Response(JSON.stringify({ error: 'Network error' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // Fallback för övriga externa requests → network only
  e.respondWith(fetch(e.request));
});
