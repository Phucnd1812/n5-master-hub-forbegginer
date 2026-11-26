const RELEASE = '5.53';
const scope = new URL(self.registration.scope);
const cachePrefix = `n5-master-hub:${scope.pathname}:`;
const cacheName = cachePrefix + RELEASE;
const dictionaryCache = cachePrefix + 'dictionary-v1';
const shell = new URL('index.html', scope);
const releaseMarker = `<meta name="n5-release" content="${RELEASE}">`;
const assets = new Set([
  'manifest.webmanifest',
  `pwa.js?v=${RELEASE}`,
  `assets/study-engine.js?v=${RELEASE}`,
  `assets/smart-study.js?v=${RELEASE}`,
  `assets/tailwind.css?v=${RELEASE}`,
  `assets/ui/premium.css?v=${RELEASE}`,
  `assets/ui/effects.js?v=${RELEASE}`,
  'assets/ui/reading.js',
  `assets/ui/handwriting.css?v=${RELEASE}`,
  `assets/ui/handwriting.js?v=${RELEASE}`,
  `assets/learning/builder.css?v=${RELEASE}`,
  `assets/learning/checker.css?v=${RELEASE}`,
  `assets/search/lookup.css?v=${RELEASE}`,
  `assets/search/lookup-ui.js?v=${RELEASE}`,
  `assets/search/search-worker.js?v=${RELEASE}`,
  'assets/search/search-client.js',
  'assets/search/search-engine.js',
  'assets/search/sentence-analyzer.js',
  'assets/search/syntax.js',
  'assets/search/morphology.js',
  'assets/search/grammar-data.js',
  'assets/search/lexicon.js',
  `assets/grammar/grammar.css?v=${RELEASE}`,
  'assets/grammar/comparisons.js',
  'assets/grammar/course.js',
  'assets/grammar/extensions.js',
  'assets/grammar/formation.js',
  'assets/grammar/grammar-ui.js',
  'assets/grammar/practice.js',
  'assets/grammar/questions.js',
  'assets/grammar/question-view.js',
  'assets/grammar/search-data.js',
  'assets/learning/builder.js',
  'assets/learning/builder-data.js',
  'assets/learning/checker-view.js',
  'assets/learning/grammar-checker.js',
  'assets/data/kanji-templates.bin',
  'assets/data/kanji-strokes.json',
  'assets/search/builtin-dictionary.json',
  'assets/search/jmdict-essentials.json',
  'assets/search/jmdict-context.json',
  'assets/search/jmdict-hotfix.json',
  'assets/search/text.js',
  'assets/search/furigana-normalizer.js',
  'assets/search/tap-lookup.js',
  'assets/fonts/v1/fonts.css',
  'assets/fonts/v1/jakarta.woff2',
  'assets/fonts/v1/vietnam-400.woff2',
  'assets/fonts/v1/vietnam-500.woff2',
  'assets/fonts/v1/vietnam-600.woff2',
  'assets/fonts/v1/jp-core.woff2',
  'assets/search/catalog-keys.js',
  'assets/search/dictionary-catalog.js',
  'assets/dictionary/v1/index.json',
  'assets/dictionary/v1/vocab-n5.json',
  'assets/dictionary/v1/kanji-core.json',
  'assets/search/result-ui.js',
  `assets/search/result.css?v=${RELEASE}`,
  `assets/translation/translation.css?v=${RELEASE}`,
  'assets/translation/protocol.js',
  'assets/translation/rules.js',
  'assets/translation/document.js',
  'assets/translation/client.js',
  'assets/translation/memory.js',
  'assets/translation/view.js',
  'assets/vendor/lucide-1.77.0.min.js',
  'assets/icons/favicon.png',
  'assets/icons/brand.png',
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
    await Promise.all(keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName && key !== dictionaryCache)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'N5_ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
  if (event.data === 'N5_GET_VERSION') event.source?.postMessage({type: 'N5_VERSION', release: RELEASE});
});

async function cachedOrNetwork(key, request, navigation = false, storage = cacheName) {
  try {
    const cached = await caches.match(key, {cacheName:storage});
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
      const cache = await caches.open(storage);
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
  } else {
    const url = new URL(request.url);
    const root = new URL('assets/dictionary/v1/',scope);
    const shard = url.pathname.slice(root.pathname.length);
    const font = new URL('assets/fonts/v1/',scope);
    if (url.origin===font.origin && url.pathname.startsWith(font.pathname) && !url.search &&
        /^jp-[0-8]\.woff2$/.test(url.pathname.slice(font.pathname.length))) {
      event.respondWith(cachedOrNetwork(request.url,request)); return;
    }

    if (url.origin===root.origin && url.pathname.startsWith(root.pathname) && !url.search &&
        /^(?:words\/(?:h-[a-f0-9]{2}|[rv]-[a-z0-9]{2})|(?:kanji|strokes)\/[a-f0-9]{2})\.json$/.test(shard)) {
      event.respondWith(cachedOrNetwork(request.url,request,false,dictionaryCache));
    }
  }
});
