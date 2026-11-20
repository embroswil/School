// Travail sans reseau (appel et notes) :
// 1. les pages de l'enseignant (classes, appel, notes, cours du jour) gardent sur le telephone leur derniere
//    version : sans reseau, elles s'affichent quand meme ;
// 2. un appel ou des notes enregistres sans reseau sont gardes sur le telephone et envoyes automatiquement
//    des le retour du reseau (ou a la prochaine ouverture de l'application).
import { api, session } from './api.js'
import { annoncer } from './ui.jsx'

const CLE_COPIES = 'sukul-hors-ligne'
const CLE_ATTENTE = 'sukul-envois'
const MAX = 60
// demandes dont la derniere reponse est gardee sur le telephone
const GARDEES = /^\/api\/(notes\/(appel|evaluations|classes|mes-classes)|presence-enseignants\/mes-cours|inscriptions\/mes-etablissements)/

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

// ---------------------------------------------------------------- copies des pages
export function garderCopie(path, valeur) {
  if (!GARDEES.test(path)) return
  const copies = lire(CLE_COPIES, {})
  const k = `${utilisateur()}|${path}`
  delete copies[k]
  copies[k] = { ...valeur, le: Date.now() }
  const cles = Object.keys(copies)
  for (const vieille of cles.slice(0, Math.max(0, cles.length - MAX))) delete copies[vieille]
  if (!ecrire(CLE_COPIES, copies)) {
    // stockage plein : on garde seulement les plus recentes
    const recentes = Object.fromEntries(Object.entries(copies).slice(-15))
    ecrire(CLE_COPIES, recentes)
  }
}
export const lireCopie = (path) => lire(CLE_COPIES, {})[`${utilisateur()}|${path}`] || null

// Copie la plus recente dont l'adresse commence par `debut` (ex. l'appel d'une classe a une autre date)
export function copieProche(debut) {
  const prefixe = `${utilisateur()}|${debut}`
  const trouvees = Object.entries(lire(CLE_COPIES, {})).filter(([k]) => k.startsWith(prefixe))
  if (!trouvees.length) return null
  const [k, v] = trouvees.sort((a, b) => b[1].le - a[1].le)[0]
  return { ...v, path: k.slice(String(utilisateur()).length + 1) }
}

// ---------------------------------------------------------------- envois en attente
const signaler = () => window.dispatchEvent(new Event('sukul-envois'))
export const envoisEnAttente = () => lire(CLE_ATTENTE, []).filter((x) => x.utilisateur === utilisateur())

// Garde un envoi pour plus tard. `cle` identifie ce qui est envoye (un meme appel remplace le precedent).
export function mettreEnAttente({ cle, path, body, libelle }) {
  const liste = lire(CLE_ATTENTE, []).filter((x) => !(x.cle === cle && x.utilisateur === utilisateur()))
  liste.push({ cle, path, body, libelle, utilisateur: utilisateur(), le: Date.now() })
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

// Envoie ce qui attend. Les envois sont des remplacements (appel du cours, notes de l'evaluation) :
// les renvoyer ne cree jamais de doublon.
let enCours = false
export async function envoyerAttente() {
  if (enCours || !utilisateur()) return
  const liste = envoisEnAttente()
  if (!liste.length) return
  enCours = true
  try {
    for (const x of liste) {
      try {
        await api.put(x.path, x.body, { rejouable: true })
        retirerAttente(x.cle)
        annoncer(`${x.libelle} : envoyé.`)
      } catch (err) {
        if (err.status === 0) break // toujours pas de reseau : on reessaiera
        if (err.status === 401) break // session a renouveler : on reessaiera apres connexion
        retirerAttente(x.cle) // refuse par le serveur (classe changee, droits…) : inutile de reessayer
        annoncer(`${x.libelle} : non envoyé (${err.message})`)
      }
    }
  } finally {
    enCours = false
  }
}

export function demarrerEnvoisAuto() {
  window.addEventListener('online', () => setTimeout(envoyerAttente, 1500))
  setInterval(() => {
    if (navigator.onLine !== false) envoyerAttente()
  }, 30000)
  setTimeout(envoyerAttente, 4000)
}
