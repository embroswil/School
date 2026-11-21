// Travail sans reseau, dans tous les espaces :
// 1. chaque page consultee garde sa derniere version sur l'appareil (base IndexedDB) : sans reseau,
//    elle s'affiche quand meme, avec la date de la copie ;
// 2. ce qui est fait sans reseau (appel, notes, presence en cours, cahier de textes, devoirs, messages,
//    absence, encaissement au guichet…) est garde sur l'appareil et envoye automatiquement des le retour
//    du reseau (ou a la prochaine ouverture de l'application) ;
// 3. l'administration garde aussi un « paquet » de la scolarite (eleves, frais, recus) pour encaisser
//    et verifier les recus sans reseau.
import { api, session } from './api.js'
import { annoncer } from './ui.jsx'

const CLE_ATTENTE = 'sukul-envois'
const ANCIENNES = 'sukul-hors-ligne' // anciennes copies (localStorage), reprises une fois
const MAX = 400
// demandes jamais gardees (compteurs, quotas, cles…)
const EXCLUES = /^\/api\/(boite\/compteurs|ia\/|push\/|abonnement|auth\/|codes\/)/

const lire = (cle, defaut) => {
  try {
    return JSON.parse(localStorage.getItem(cle)) ?? defaut
  } catch {
    return defaut
  }
}
const ecrire = (cle, v) => {
  try {
    localStorage.setItem(cle, JSON.stringify(v))
    return true
  } catch {
    return false // stockage plein ou indisponible
  }
}
const utilisateur = () => session.get()?.user?.id || 0
const espace = () => session.get()?.user?.espace || ''

// ---------------------------------------------------------------- base de l'appareil (IndexedDB)
let base = null
function ouvrir() {
  if (base) return base
  base = new Promise((ok) => {
    try {
      const r = window.indexedDB.open('sukul', 1)
      r.onupgradeneeded = () => {
        r.result.createObjectStore('copies')
        r.result.createObjectStore('paquets')
      }
      r.onsuccess = () => ok(r.result)
      r.onerror = () => ok(null)
    } catch {
      ok(null)
    }
  })
  return base
}
async function idb(magasin, mode, action) {
  const db = await ouvrir()
  if (!db) return null
  return new Promise((ok) => {
    try {
      const tx = db.transaction(magasin, mode)
      const r = action(tx.objectStore(magasin))
      tx.oncomplete = () => ok(r?.result ?? null)
      tx.onerror = () => ok(null)
      tx.onabort = () => ok(null)
    } catch {
      ok(null)
    }
  })
}

// ---------------------------------------------------------------- copies des pages
// Index en memoire (lu au demarrage) : la lecture reste immediate ; l'ecriture part dans la base.
const copies = new Map()
let chargees = null
export function chargerCopies() {
  chargees ??= (async () => {
    const tout = await idb('copies', 'readonly', (s) => s.getAll())
    const cles = await idb('copies', 'readonly', (s) => s.getAllKeys())
    if (tout && cles) cles.forEach((k, i) => copies.set(k, tout[i]))
    // reprise des copies de l'ancienne version (appel et notes)
    const anciennes = lire(ANCIENNES, null)
    if (anciennes) {
      for (const [k, v] of Object.entries(anciennes)) if (!copies.has(k)) garder(k, v)
      try {
        localStorage.removeItem(ANCIENNES)
      } catch {
        /* rien */
      }
    }
  })()
  return chargees
}
const cleCopie = (path) => `${utilisateur()}|${espace()}|${path}`
function garder(k, v) {
  copies.delete(k)
  copies.set(k, v)
  idb('copies', 'readwrite', (s) => s.put(v, k))
  if (copies.size > MAX) {
    const vieille = copies.keys().next().value
    copies.delete(vieille)
    idb('copies', 'readwrite', (s) => s.delete(vieille))
  }
}
export function garderCopie(path, valeur) {
  if (!path.startsWith('/api/') || EXCLUES.test(path) || !utilisateur()) return
  garder(cleCopie(path), { ...valeur, le: Date.now() })
}
export const lireCopie = (path) => copies.get(cleCopie(path)) || null
export const copiesPretes = () => chargerCopies()

// Copie la plus recente dont l'adresse commence par `debut` (ex. l'appel d'une classe a une autre date)
export function copieProche(debut) {
  const prefixe = cleCopie(debut)
  const trouvees = [...copies.entries()].filter(([k]) => k.startsWith(prefixe))
  if (!trouvees.length) return null
  const [k, v] = trouvees.sort((a, b) => b[1].le - a[1].le)[0]
  return { ...v, path: k.slice(cleCopie('').length) }
}

// ---------------------------------------------------------------- paquets (guichet, verification)
export const lirePaquet = (nom) => idb('paquets', 'readonly', (s) => s.get(`${utilisateur()}|${nom}`))
export const garderPaquet = (nom, v) => idb('paquets', 'readwrite', (s) => s.put({ ...v, garde: Date.now() }, `${utilisateur()}|${nom}`))

// ---------------------------------------------------------------- envois en attente
const signaler = () => window.dispatchEvent(new Event('sukul-envois'))
export const envoisEnAttente = () => lire(CLE_ATTENTE, []).filter((x) => x.utilisateur === utilisateur())

// Garde un envoi pour plus tard. `cle` identifie ce qui est envoye (un meme appel remplace le precedent).
// `methode` : put (par defaut), post ou delete. Les envois doivent pouvoir etre rejoues sans doublon.
export function mettreEnAttente({ cle, path, body, libelle, methode = 'put' }) {
  const liste = lire(CLE_ATTENTE, []).filter((x) => !(x.cle === cle && x.utilisateur === utilisateur()))
  liste.push({ cle, path, body, libelle, methode, utilisateur: utilisateur(), le: Date.now() })
  const ok = ecrire(CLE_ATTENTE, liste)
  signaler()
  return ok
}
export function retirerAttente(cle) {
  ecrire(
    CLE_ATTENTE,
    lire(CLE_ATTENTE, []).filter((x) => !(x.cle === cle && x.utilisateur === utilisateur())),
  )
  signaler()
}

// Envoie tout de suite ; sans reseau, garde l'envoi pour plus tard. Renvoie { attente: true } dans ce cas.
export async function envoyerOuGarder({ cle, path, body, libelle, methode = 'post' }) {
  try {
    const r = await api[methode](path, body)
    retirerAttente(cle)
    return { data: r.data, attente: false }
  } catch (err) {
    if (err.status === 0 && mettreEnAttente({ cle, path, body, libelle, methode })) return { attente: true }
    throw err
  }
}

let enCours = false
export async function envoyerAttente() {
  if (enCours || !utilisateur()) return
  const liste = envoisEnAttente()
  if (!liste.length) return
  enCours = true
  try {
    for (const x of liste) {
      try {
        await api[x.methode || 'put'](x.path, x.body, { rejouable: true })
        retirerAttente(x.cle)
        annoncer(`${x.libelle} : envoyé.`)
      } catch (err) {
        if (err.status === 0) break // toujours pas de reseau : on reessaiera
        if (err.status === 401) break // session a renouveler : on reessaiera apres connexion
        retirerAttente(x.cle) // refuse par le serveur : inutile de reessayer
        annoncer(`${x.libelle} : non envoyé (${err.message})`)
      }
    }
  } finally {
    enCours = false
  }
}

export function demarrerEnvoisAuto() {
  chargerCopies()
  window.addEventListener('online', () => setTimeout(envoyerAttente, 1500))
  setInterval(() => {
    if (navigator.onLine !== false) envoyerAttente()
  }, 30000)
  setTimeout(envoyerAttente, 4000)
}

// Identifiant unique cree sur l'appareil (encaissement sans reseau)
export const idLocal = () => `OP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
