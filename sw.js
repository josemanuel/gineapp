// ═══════════════════════════════════════════════
// GinecoApp Pro — Service Worker v2.2
// Estrategia: Cache-first para assets estáticos
//             Network-first con fallback para navegación
// ═══════════════════════════════════════════════

const CACHE_NAME = 'gineco-v2-2';
const CACHE_STATIC = 'gineco-static-v2-2';

// Assets que se cachean en la instalación
const PRECACHE_URLS = [
  './gineapp.html',
  './ayuda.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// ── Install: precachear assets críticos ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => {
        // Cachear assets locales primero (no fallan)
        const local = PRECACHE_URLS.filter(u => !u.startsWith('http'));
        return cache.addAll(local)
          .then(() => {
            // Intentar cachear Google Fonts (puede fallar en offline)
            const remote = PRECACHE_URLS.filter(u => u.startsWith('http'));
            return Promise.allSettled(remote.map(url =>
              fetch(url).then(r => cache.put(url, r)).catch(() => {})
            ));
          });
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate: limpiar caches antiguos ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: estrategia según tipo de request ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // IndexedDB y datos locales: no interceptar
  if (event.request.method !== 'GET') return;

  // Google Fonts: cache-first con fallback de red
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request)
        .then(cached => cached || fetch(event.request)
          .then(response => {
            const clone = response.clone();
            caches.open(CACHE_STATIC)
              .then(cache => cache.put(event.request, clone));
            return response;
          })
          .catch(() => new Response('', { status: 503 }))
        )
    );
    return;
  }

  // HTML de la app: network-first, fallback a cache
  // Así el médico siempre tiene acceso aunque esté offline
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Actualizar cache con versión fresca
          const clone = response.clone();
          caches.open(CACHE_STATIC)
            .then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request)
          .then(cached => cached ||
            new Response('<h1>Sin conexión</h1><p>Abre GinecoApp Pro cuando tengas conexión para cargarla por primera vez.</p>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
          )
        )
    );
    return;
  }

  // Resto de assets (SVG, JSON, etc.): cache-first
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_STATIC)
            .then(cache => cache.put(event.request, clone));
          return response;
        })
      )
  );
});

// ── Mensaje desde la app para forzar actualización ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
