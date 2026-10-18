/* Service worker: офлайн-режим и мгновенный запуск приложения. */
const VERSION = '1.0.0';
const CACHE = `norm-${VERSION}`;
const SHELL = './index.html';

const ASSETS = [
  './',
  SHELL,
  './styles.css',
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './js/app.js',
  './js/config.js',
  './js/store.js',
  './js/calc.js',
  './js/foods.js',
  './js/ui.js',
  './js/theme.js',
  './js/pwa.js',
  './js/views/onboarding.js',
  './js/views/diary.js',
  './js/views/picker.js',
  './js/views/products.js',
  './js/views/progress.js',
  './js/views/profile.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Навигация: сначала сеть, офлайн — сохранённая оболочка.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(SHELL, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(SHELL).then((r) => r || caches.match('./')))
    );
    return;
  }

  // Статика: из кеша сразу, обновление — в фоне.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
