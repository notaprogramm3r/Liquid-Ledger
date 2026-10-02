/*
 * Minimal offline-first service worker: cache the app shell so the
 * calculator and logbook keep working with no internet connection.
 * Backup to Dropbox/Google Drive still needs a network connection.
 */
const CACHE_NAME = 'liquid-assets-alpha-1.31';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/version.js',
  './js/localfolder.js',
  './js/chem.js',
  './js/storage.js',
  './js/dropbox.js',
  './js/gdrive.js',
  './js/onedrive.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never intercept calls to Dropbox/Google APIs — those must hit the network.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(resp => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return resp;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
