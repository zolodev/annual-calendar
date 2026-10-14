// Service worker: cache-first för appens filer. Cachenamnet följer VERSION (skickas som ?v=),
// så en ny version laddar om filerna och rensar den gamla cachen.
const CACHE = `arshjul-${new URL(location).searchParams.get('v')}`;
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg', 'css/app.css',
  'js/app.js', 'js/i18n.js', 'js/model.js', 'js/store.js', 'js/version.js', 'js/wheel.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('arshjul-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' })
    .then(list => (list[0] ? list[0].focus() : self.clients.openWindow('./'))));
});
