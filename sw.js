const CACHE = 'pelagial-v22-events';
const FILES = ['./', './index.html', './styles.css', './events-pack-2.js', './events-pack-3.js', './app.js', './manifest.webmanifest', './icon.svg', './assets/menu-nereida-v1.png', './assets/crew-sprites-v1.png', './assets/europa-awaits.mp3', './assets/beneath-europa.mp3'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
    const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response;
  }).catch(() => caches.match('./index.html'))));
});
