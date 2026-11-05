// Service worker de School : l'application s'ouvre vite et reste affichable
// hors connexion (les pages deja vues). Les donnees (API) ne sont jamais mises en cache.
const CACHE = 'school-v3'
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

// Notifications « push » : affichage sur l'ecran du telephone, meme School ferme
self.addEventListener('push', (e) => {
  let m = {}
  try {
    m = e.data ? e.data.json() : {}
  } catch (_) {
    m = { title: 'School', body: e.data ? e.data.text() : '' }
  }
  e.waitUntil(
    self.registration.showNotification(m.title || 'School', {
      body: m.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: m.tag,
      data: { lien: m.lien || '/notifications' },
    }),
  )
})

// Toucher la notification ouvre School a la bonne page
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = `/#${e.notification.data?.lien || '/'}`
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      for (const f of fenetres) {
        if ('focus' in f) {
          f.navigate(url).catch(() => {})
          return f.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
