// Service worker: keeps the app shell (page, walletd.wasm, workers, icons) so the installed app opens offline.
// Network first, cache as fallback: an online start always gets the latest files.
// Node requests (/json_rpc, /binary_rpc, /sync_blocks/) and anything not GET are never cached.
'use strict';
const CACHE = 'amethyst-web-wallet-v23';
const SHELL = [
  './', 'index.html', 'i18n.js', 'app.js', 'manifest.webmanifest', 'walletd-worker.js',
  'lang/en.txt', 'lang/uk.txt', 'lang/es.txt', 'lang/pt.txt', 'lang/tr.txt', 'lang/id.txt', 'lang/vi.txt', 'lang/zh.txt',
  'walletd.js', 'walletd.wasm', 'walletworker-main.js', 'walletworker.js', 'walletworker.wasm',
  'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
];
const NODE_PATHS = ['/json_rpc', '/binary_rpc', '/sync_blocks/'];

self.addEventListener('install', (e) => {
  // cache: 'reload' so a long max-age on the hosting cannot put old files into the new cache
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (NODE_PATHS.some((p) => url.pathname.startsWith(p))) return;
  // cache: 'no-cache' makes the browser ask the server even if the hosting sends a long max-age
  // (a cheap 304 when nothing changed), so an update reaches the phone on the next start, not days later.
  const req = e.request.mode === 'navigate'
    ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
    : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(fetch(req).then((resp) => {
    if (resp.ok) {
      const copy = resp.clone();
      // a reload can abort the body while it is being cached ("Load failed" in Safari): keep the old copy then
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
    }
    return resp;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
