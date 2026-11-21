const RELEASE = '5.46';
const scope = new URL(self.registration.scope);
const cachePrefix = `n5-master-hub:${scope.pathname}:`;
const cacheName = cachePrefix + RELEASE;
const shell = new URL('index.html', scope).href;
const assets = new Set([
  'manifest.webmanifest',
  `pwa.js?v=${RELEASE}`,
  `assets/tailwind.css?v=${RELEASE}`,
  'assets/vendor/lucide-1.77.0.min.js',
  'assets/icons/favicon.png',
  'assets/icons/apple-touch.png',
  'assets/icons/app-192.png',
  'assets/icons/app-512.png',
  'assets/icons/app-maskable-512.png',
].map(path => new URL(path, scope).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const publicRequest = url => new Request(url, {cache: 'reload', credentials: 'omit'});
    const page = await fetch(publicRequest(shell));
    // GitHub Pages can briefly serve files from different deployments.
    if (!page.ok || !(await page.clone().text()).includes(`<meta name="n5-release" content="${RELEASE}">`)) {
      throw new Error('The published app shell does not match this service worker');
    }
    const cache = await caches.open(cacheName);
    await cache.addAll(Array.from(assets, publicRequest));
    await cache.put(shell, page);
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'N5_ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
  if (event.data === 'N5_GET_VERSION') event.source?.postMessage({type: 'N5_VERSION', release: RELEASE});
});

async function cachedOrNetwork(key, request) {
  const cache = await caches.open(cacheName);
  return (await cache.match(key)) || fetch(request);
}

self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET') return;

  // Only this app's public shell and listed static assets are eligible for caching.
  if (request.mode === 'navigate') {
    const url = new URL(request.url);
    if (url.origin === scope.origin &&
        (url.pathname === scope.pathname || url.pathname === new URL(shell).pathname)) {
      event.respondWith(cachedOrNetwork(shell, request));
    }
  } else if (assets.has(request.url)) {
    event.respondWith(cachedOrNetwork(request.url, request));
  }
});
