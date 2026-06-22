// ═══════════════════════════════════════════════
// GinecoApp Pro — Service Worker v2.3
// GitHub Pages: https://josemanuel.github.io/gineapp/
// ═══════════════════════════════════════════════

const CACHE_NAME = 'gineco-static-v2-3';
const CACHE_LIBS = 'gineco-libs-v1'; // separado: las librerías casi nunca cambian de versión
const BASE = '/gineapp/';

// Assets de la app (cambian con cada actualización)
const PRECACHE_URLS = [
  BASE + 'gineapp.html',
  BASE + 'ayuda.html',
  BASE + 'manifest.json',
  BASE + 'icon-192.svg',
  BASE + 'icon-512.svg',
];

// Librerías de terceros (estables — jsPDF/html2canvas no cambian salvo actualización deliberada de versión)
const LIB_URLS = [
  BASE + 'lib/jspdf.umd.min.js',
  BASE + 'lib/html2canvas.min.js',
];

// ── Install: precachear assets críticos + librerías ──
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)),
      caches.open(CACHE_LIBS).then(cache => cache.addAll(LIB_URLS))
    ])
      .then(() => self.skipWaiting())
      .catch(err => {
        console.warn('SW install error (non-fatal):', err);
        return self.skipWaiting();
      })
  );
});

// ── Activate: limpiar caches antiguos (preserva CACHE_LIBS si no cambió de nombre) ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== CACHE_LIBS)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: solo interceptar requests dentro del scope /gineapp/ ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Solo GET
  if (event.request.method !== 'GET') return;

  // Google Fonts: cache-first
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // Solo interceptar URLs dentro del scope del repositorio
  if (!url.pathname.startsWith(BASE)) return;

  // Librerías en /lib/: cache-first puro, casi nunca cambian (cache separado y estable)
  if (url.pathname.includes('/lib/')) {
    event.respondWith(
      caches.match(event.request, { cacheName: CACHE_LIBS }).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_LIBS).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // HTML: network-first con fallback a cache
  if (url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request)
          .then(cached => cached || caches.match(BASE + 'gineapp.html'))
        )
    );
    return;
  }

  // Resto (SVG, JSON, etc.): cache-first con actualización en background
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        return response;
      });
      return cached || fetchPromise;
    })
  );
});

// ── Mensaje desde la app para forzar actualización ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
