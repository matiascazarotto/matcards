const CACHE_NAME = 'matcards-v18';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/utils.js',
  './js/db.js',
  './js/srs.js',
  './js/lextale.js',
  './js/tts.js',
  './js/stats.js',
  './js/importExport.js',
  './js/apkg-import.js',
  './js/github-sync.js',
  './js/sync-runner.js',
  './js/firebase.js',
  './js/cloud-sync.js',
  './js/views/home.js',
  './js/views/placement.js',
  './js/views/review.js',
  './js/views/decks.js',
  './js/views/stats.js',
  './js/views/settings.js',
  './js/views/history.js',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './data/lextale-items.json',
  './data/deck-a1.json',
  './data/deck-a2.json',
  './data/deck-b1.json',
  './data/deck-b2.json',
  './data/deck-false-friends-pt-en.json',
  './data/deck-survival-60.json',
  './data/deck-irregular-50.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] skip cache:', url, err.message))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : null));

      return cached || networkFetch;
    })
  );
});
