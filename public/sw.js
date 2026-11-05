/* Service worker: офлайн-режим и мгновенный запуск приложения. */
const VERSION = '2.0.0';
const CACHE = `norm-${VERSION}`;
const SHELL = './app.html';

const ASSETS = [
  SHELL,
  './styles.css',
  './manifest.webmanifest',
  './data/ru-products.json',
  './icons/favicon.svg',
  './icons/favicon.ico',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './js/app.js',
  './js/cloud.js',
  './js/views/account.js',
  './js/config.js',
  './js/ai.js',
  './js/scan.js',
  './js/addMenu.js',
  './js/store.js',
  './js/calc.js',
  './js/foods.js',
  './js/ui.js',
  './js/theme.js',
  './js/pwa.js',
  './js/views/install.js',
  './js/views/onboarding.js',
  './js/views/diary.js',
  './js/views/picker.js',
  './js/views/products.js',
  './js/views/progress.js',
  './js/views/nutrition.js',
  './js/views/profile.js',
  './vendor/zxing.min.js',
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
  // Сервер Нормы (вход, облако, ИИ) не кешируем.
  if (url.pathname.startsWith('/api/')) return;

  // Навигация: сначала сеть, офлайн — сохранённая оболочка.
  if (request.mode === 'navigate') {
    const isApp = url.pathname === '/app' || url.pathname === '/app.html';
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isApp && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(SHELL, copy)).catch(() => {});
          }
          return response;
        })
        // Офлайн открываем приложение, даже если просили лендинг.
        .catch(() => caches.match(SHELL))
    );
    return;
  }

  // Код приложения обновляем из сети сразу, чтобы новый интерфейс не зависал на старом кеше.
  if (/\.(?:js|css|webmanifest)$/.test(url.pathname)) {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
      }
      return response;
    }).catch(() => caches.match(request)));
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
