// Service Worker mínimo para cumplir con los requisitos de PWA (Instalación)
const CACHE_NAME = 'la-cuota-v1';

self.addEventListener('install', (event) => {
  // Forzar la activación inmediata
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Estrategia básica: ir a la red por defecto
  // Esto es necesario para que el navegador considere que la PWA es válida
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
