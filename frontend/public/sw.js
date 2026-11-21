// Service worker de Sùkûl : l'application s'ouvre tout de suite, meme avec un reseau lent,
// et reste affichable hors connexion. Les donnees (API) ne sont jamais mises en cache.
const CACHE = 'sukul-v5'
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

// La page : la copie gardee sur l'appareil s'affiche aussitot. A l'ouverture de l'application installee,
// l'iPhone garde son image de demarrage tant que la page n'est pas affichee, puis la remplace (avec une
// animation de la barre d'etat) : attendre le reseau retardait ce moment d'une a deux secondes.
// La version en ligne est verifiee en meme temps ; si elle a change, elle est gardee et l'application la
// charge aussitot, sous l'ecran de demarrage (ou a la prochaine ouverture).
async function page(e) {
  const cache = await caches.open(CACHE)
  const copie = await cache.match('/')
  // texte de la copie lu tout de suite (la copie elle-meme part vers la page)
  const texteCopie = copie ? copie.clone().text() : Promise.resolve(null)
  // (une requete de navigation ne peut pas etre reprise telle quelle avec d'autres options : on passe l'adresse)
  const reseau = fetch(e.request.url, { cache: 'no-store', credentials: 'same-origin' }).then(async (rep) => {
    if (!rep.ok) return rep
    const nouveau = await rep.clone().text()
    const ancien = await texteCopie
    await cache.put('/', rep.clone())
    if (ancien !== null && ancien !== nouveau) {
      const id = e.resultingClientId || e.clientId
      const client = id ? await self.clients.get(id) : null
      const fenetres = client ? [client] : await self.clients.matchAll({ type: 'window' })
      fenetres.forEach((f) => f.postMessage({ type: 'nouvelle-version' }))
    }
    return rep
  })
  if (copie) {
    e.waitUntil(reseau.catch(() => {}))
    return copie
  }
  try {
    return await reseau
  } catch (_) {
    return Response.error()
  }
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
  // Presence en cours : notification « a valider », qui reste affichee (ecran verrouille compris)
  // jusqu'a ce que l'enseignant reponde. Android : boutons Oui / Non dans la notification. iPhone (les applications
  // web n'y ont pas de boutons) : toucher la notification ouvre Sùkûl sur la question Oui / Non.
  const valider = m.type === 'attendance' && m.confirmer
  e.waitUntil(
    self.registration.showNotification(m.title || 'Sùkûl', {
      body: m.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: m.tag,
      renotify: Boolean(valider),
      requireInteraction: Boolean(valider),
      vibrate: valider ? [300, 120, 300, 120, 300] : undefined,
      actions: valider ? [{ action: 'oui', title: 'Oui, je suis en cours' }, { action: 'non', title: 'Non' }] : undefined,
      data: { lien: m.lien || '/notifications', confirmer: m.confirmer || null },
    }),
  )
})

// Reponse Oui / Non donnee depuis la notification (ecran verrouille compris, Android) : envoyee directement
// au serveur avec le jeton de la notification, sans ouvrir Sùkûl. Sans reseau : Sùkûl s'ouvre et garde la reponse.
async function repondre(n, reponse) {
  const c = n.data?.confirmer
  try {
    const r = await fetch('/api/presence-enseignants/notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jeton: c.jeton, reponse }),
    })
    const corps = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(corps.message || 'refus')
    await self.registration.showNotification(reponse === 'oui' ? 'Présence confirmée' : 'Absence signalée', {
      body: reponse === 'oui' ? `${c.classe || 'Cours'} · ${c.debut} : merci, votre présence est enregistrée.` : `${c.classe || 'Cours'} · ${c.debut} : l’établissement est prévenu.`,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: n.tag,
    })
    return true
  } catch (_) {
    return false
  }
}

// Toucher la notification ouvre Sùkûl a la bonne page
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const c = e.notification.data?.confirmer
  if ((e.action === 'oui' || e.action === 'non') && c?.jeton) {
    e.waitUntil(
      repondre(e.notification, e.action).then((ok) => {
        if (ok) return null
        // pas de reseau (ou notification expiree) : Sùkûl s'ouvre sur le cours, avec la reponse choisie
        return self.clients.openWindow(`/#${e.notification.data.lien}&reponse=${e.action}`)
      }),
    )
    return
  }
  // Toucher la notification de presence : Sùkûl s'ouvre sur la question Oui / Non.
  const lien = e.notification.data?.lien || '/'
  const url = `/#${lien}`
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
