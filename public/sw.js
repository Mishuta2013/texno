// TexnoPlaza service worker — basic offline (network-first HTML, cache-first assets).
const C = 'tp-v1';
const PRE = ['/', '/assets/icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(PRE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // let fonts / elfsight / telegram go to network
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    e.respondWith(
      fetch(req).then(r => { const cc = r.clone(); caches.open(C).then(c => c.put(req, cc)); return r; })
        .catch(() => caches.match(req).then(m => m || caches.match('/')))
    );
  } else {
    e.respondWith(
      caches.match(req).then(m => m || fetch(req).then(r => { const cc = r.clone(); caches.open(C).then(c => c.put(req, cc)); return r; }))
    );
  }
});
