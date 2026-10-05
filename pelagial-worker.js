const CACHE = 'pelagial-v34-captain-station';
const FILES = ['./', './index.html', './install.html', './styles.css', './events-pack-2.js', './events-pack-3.js', './events-pack-4.js', './events-pack-horror.js', './major-scenes.js', './science-data.js', './app.js', './pelagial.webmanifest', './app-icon-180.png', './app-icon-192.png', './app-icon-512.png', './assets/menu-nereida-v1.png', './assets/captain-bridge-v1.png', './assets/crew-sprites-v1.png', './assets/europa-awaits.mp3', './assets/beneath-europa.mp3'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => Promise.allSettled(FILES.map(file => cache.add(file)))).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match('./index.html'))));
});
