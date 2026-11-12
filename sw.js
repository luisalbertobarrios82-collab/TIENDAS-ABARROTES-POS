// Primero intenta la red para recibir actualizaciones; sin conexión usa la copia guardada.
const CACHE = 'abarroteria-pos-v9';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg', 'css/styles.css', 'vendor/zxing.min.js',
  'js/app.js', 'js/core.js', 'js/db.js', 'js/services.js', 'js/ui.js', 'js/cart.js', 'js/catalog.js', 'js/sheets.js', 'js/name-suggest.js', 'js/product-names.js', 'js/photo.js', 'js/scanner.js', 'js/sounds.js', 'js/xlsx.js', 'js/xlsx-read.js', 'js/import-map.js',
  'js/views/sell.js', 'js/views/scan.js', 'js/views/inventory.js', 'js/views/corte.js', 'js/views/fiado.js',
  'js/views/facturas.js', 'js/views/sales.js', 'js/views/reports.js', 'js/views/settings.js', 'js/views/import.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES.map((file) => new Request(file, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    // no-cache evita la copia de hasta 10 minutos que permite GitHub Pages.
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => (await caches.match(request, { ignoreSearch: true })) || caches.match('index.html')),
  );
});
