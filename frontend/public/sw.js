// Service worker de School : l'application s'ouvre vite et reste affichable
// hors connexion (les pages deja vues). Les donnees (API) ne sont jamais mises en cache.
const CACHE = 'school-v1'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c)))))
  self.clients.claim()
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  // Reseau d'abord, copie de secours en cache
  e.respondWith(
    fetch(req)
      .then((rep) => {
        const copie = rep.clone()
        caches.open(CACHE).then((c) => c.put(req, copie))
        return rep
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/'))),
  )
})
