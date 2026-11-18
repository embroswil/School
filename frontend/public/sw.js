// Service worker de Sùkûl : l'application s'ouvre tout de suite, meme avec un reseau lent,
// et reste affichable hors connexion. Les donnees (API) ne sont jamais mises en cache.
const CACHE = 'sukul-v4'
const POLICES = ['fonts.googleapis.com', 'fonts.gstatic.com']

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add('/'))
      .catch(() => {}),
  )
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c)))))
  self.clients.claim()
})

// La page : toujours la version en ligne, pour que l'application (et l'icone ajoutee a l'ecran d'accueil)
// recoive aussitot chaque correction. Sans reseau, ou si le reseau ne repond pas en 4 s, la copie
// gardee sur l'appareil est affichee.
async function page(e) {
  const cache = await caches.open(CACHE)
  const reseau = fetch(e.request, { cache: 'no-store' }).then((rep) => {
    if (rep.ok) cache.put('/', rep.clone())
    return rep
  })
  const delai = new Promise((r) => setTimeout(r, 4000)).then(() => cache.match('/'))
  try {
    const rep = await Promise.race([reseau, delai])
    if (rep) return rep
  } catch (_) {
    /* pas de reseau */
  }
  return (await cache.match('/')) || reseau
}

// Fichiers qui ne changent jamais (scripts et styles numerotes, polices) : copie de l'appareil d'abord
async function fige(req) {
  const cache = await caches.open(CACHE)
  const copie = await cache.match(req)
  if (copie) return copie
  const rep = await fetch(req)
  if (rep.ok || rep.type === 'opaque') cache.put(req, rep.clone())
  return rep
}

// Le reste (icones, images) : reseau d'abord, copie de secours
function reseauDabord(req) {
  return fetch(req)
    .then((rep) => {
      const copie = rep.clone()
      caches.open(CACHE).then((c) => c.put(req, copie))
      return rep
    })
    .catch(() => caches.match(req).then((r) => r || Response.error()))
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (POLICES.includes(url.hostname)) return e.respondWith(fige(req))
  if (url.origin !== self.location.origin) return
  // demandes au serveur passees par sukul.site : jamais gardees sur l'appareil
  if (url.pathname.startsWith('/api/')) return
  if (req.mode === 'navigate') return e.respondWith(page(e))
  if (url.pathname.startsWith('/assets/')) return e.respondWith(fige(req))
  e.respondWith(reseauDabord(req))
})

// Notifications « push » : affichage sur l'ecran du telephone, meme Sùkûl ferme
self.addEventListener('push', (e) => {
  let m = {}
  try {
    m = e.data ? e.data.json() : {}
  } catch (_) {
    m = { title: 'Sùkûl', body: e.data ? e.data.text() : '' }
  }
  e.waitUntil(
    self.registration.showNotification(m.title || 'Sùkûl', {
      body: m.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: m.tag,
      data: { lien: m.lien || '/notifications' },
    }),
  )
})

// Toucher la notification ouvre Sùkûl a la bonne page
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
