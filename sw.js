// Service worker: keeps the app shell (page, walletd.wasm, workers, icons) so the installed app opens offline.
// Network first, cache as fallback: an online start always gets the latest files.
// Node requests (/json_rpc, /binary_rpc, /sync_blocks/) and anything not GET are never cached.
'use strict';
const CACHE = 'amethyst-web-wallet-v5';
const SHELL = [
  './', 'index.html', 'app.js', 'manifest.webmanifest', 'walletd-worker.js',
  'walletd.js', 'walletd.wasm', 'walletworker-main.js', 'walletworker.js', 'walletworker.wasm',
  'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
];
const NODE_PATHS = ['/json_rpc', '/binary_rpc', '/sync_blocks/'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
  e.respondWith(fetch(e.request).then((resp) => {
    if (resp.ok) {
      const copy = resp.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return resp;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
