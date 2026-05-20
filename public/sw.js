// Service Worker para La Cuota PWA (Instalación, Atajos y Widgets)
const CACHE_NAME = 'la-cuota-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

// Listener para eventos de interacción con el Widget de PWA
self.addEventListener('widgetclick', (event) => {
  const { action, verb } = event;
  
  if (verb === 'quick-add') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // Buscar si ya hay una pestaña de la app abierta
        for (const client of clientList) {
          if (client.url.includes('/quick-add') && 'focus' in client) {
            return client.focus();
          }
        }
        // Si no, abrir una ventana nueva en la ruta del widget rápido
        if (clients.openWindow) {
          return clients.openWindow('/quick-add');
        }
      })
    );
  }
});
