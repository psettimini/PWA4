const CACHE_VERSION = 'gastos-pwa-v2.4.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const CDN_CACHE = `${CACHE_VERSION}-cdn`;

const APP_SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'js/state.js',
  'js/utils.js',
  'js/ui.js',
  'js/auth.js',
  'js/data.js',
  'js/carga.js',
  'js/historial.js',
  'js/dashboard.js',
  'js/comparar.js',
  'js/abm.js',
  'js/app.js',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png'
];

const CDN_URLS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE)
        .then((cache) => cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))))
        .catch(() => {}),
      caches.open(CDN_CACHE)
        .then((cache) => cache.addAll(CDN_URLS))
        .catch(() => {})
    ])
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => ![STATIC_CACHE, RUNTIME_CACHE, CDN_CACHE].includes(k))
          .map((k) => caches.delete(k))
    );
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
  })());
});

function isSameOrigin(url) { return url.origin === self.location.origin; }
function isCDN(url) { return CDN_URLS.some(cdn => url.href.startsWith(cdn.split('?')[0])); }
function isStaticAsset(req) { return ['style', 'script', 'image', 'font', 'document'].includes(req.destination); }

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok && req.method === 'GET') cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(req, { ignoreSearch: false });
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req, { ignoreSearch: false });
  const fetchPromise = fetch(req).then((res) => { if (res && res.ok && req.method === 'GET') cache.put(req, res.clone()); return res; }).catch(() => null);
  return cached || fetchPromise || Response.error();
}

async function cdnCacheFirst(req) {
  const cache = await caches.open(CDN_CACHE);
  const cached = await cache.match(req);
  if (cached) { fetch(req).then(res => { if (res && res.ok) cache.put(req, res); }).catch(() => {}); return cached; }
  try { const fresh = await fetch(req); if (fresh && fresh.ok) cache.put(req, fresh.clone()); return fresh; }
  catch { return Response.error(); }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (isCDN(url)) { event.respondWith(cdnCacheFirst(req)); return; }
  if (!isSameOrigin(url)) return;
  if (req.mode === 'navigate') { event.respondWith(networkFirst(req)); return; }
  if (isStaticAsset(req)) { event.respondWith(staleWhileRevalidate(req)); }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
