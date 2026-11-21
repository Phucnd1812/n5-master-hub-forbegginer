const RELEASE = '5.49';
const scope = new URL(self.registration.scope);
const cachePrefix = `n5-master-hub:${scope.pathname}:`;
const cacheName = cachePrefix + RELEASE;
const shell = new URL('index.html', scope);
const releaseMarker = `<meta name="n5-release" content="${RELEASE}">`;
const assets = new Set([
  'manifest.webmanifest',
  `pwa.js?v=${RELEASE}`,
  `assets/study-engine.js?v=${RELEASE}`,
  `assets/smart-study.js?v=${RELEASE}`,
  `assets/tailwind.css?v=${RELEASE}`,
  `assets/search/lookup.css?v=${RELEASE}`,
  `assets/search/lookup-ui.js?v=${RELEASE}`,
  `assets/search/search-worker.js?v=${RELEASE}`,
  'assets/search/search-client.js',
  'assets/search/search-engine.js',
  'assets/search/sentence-analyzer.js',
  'assets/search/morphology.js',
  'assets/search/grammar-data.js',
  'assets/search/lexicon.js',
  'assets/search/builtin-dictionary.json',
  'assets/search/text.js',
  'assets/vendor/lucide-1.77.0.min.js',
  'assets/icons/favicon.png',
  'assets/icons/apple-touch.png',
  'assets/icons/app-192.png',
  'assets/icons/app-512.png',
  'assets/icons/app-maskable-512.png',
].map(path => new URL(path, scope).href));

async function isCurrentShell(response) {
  return response.ok && (await response.clone().text()).includes(releaseMarker);
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const publicRequest = url => new Request(url, {cache: 'reload', credentials: 'omit'});
    const page = await fetch(publicRequest(shell.href));
    // GitHub Pages can briefly serve files from different deployments.
    if (!await isCurrentShell(page)) {
      throw new Error('The published app shell does not match this service worker');
    }
    const cache = await caches.open(cacheName);
    await cache.addAll(Array.from(assets, publicRequest));
    await cache.put(shell.href, page);
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

async function cachedOrNetwork(key, request, navigation = false) {
  try {
    const cached = await caches.match(key, {cacheName});
    if (cached) return cached;
  } catch {
    // A missing/unavailable cache can still be served from the network.
  }
  let response;
  try {
    response = await fetch(navigation ? request : new Request(key, {cache: 'reload', credentials: 'omit'}));
  } catch (error) {
    if (!navigation) throw error;
    return new Response('Chưa tải được N5 Master Hub. Hãy kết nối Internet rồi tải lại trang.', {
      status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'},
    });
  }
  // Refill an evicted shell only if it matches this specific worker.
  try {
    if (response.ok && !response.redirected && (!navigation || await isCurrentShell(response))) {
      const cache = await caches.open(cacheName);
      await cache.put(key, response.clone());
    }
  } catch {
    // The online app remains usable even if storage is full or unavailable.
  }
  return response;
}

self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET') return;

  // Only this app's public shell and listed static assets are eligible for caching.
  if (request.mode === 'navigate') {
    const url = new URL(request.url);
    if (url.origin === scope.origin &&
        (url.pathname === scope.pathname || url.pathname === shell.pathname)) {
      event.respondWith(cachedOrNetwork(shell.href, request, true));
    }
  } else if (assets.has(request.url)) {
    event.respondWith(cachedOrNetwork(request.url, request));
  }
});
