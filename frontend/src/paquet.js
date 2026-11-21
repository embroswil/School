// Scolarite sans reseau (administration) : eleves, frais, sommes payees et recus gardes sur l'appareil.
// Sert au guichet (encaisser) et a la verification des recus quand il n'y a pas de reseau.
import { api } from './api.js'
import { envoisEnAttente, garderPaquet, lirePaquet } from './horsligne.js'

const NOM = 'scolarite'
const FRAICHEUR = 10 * 60 * 1000

let enMemoire = null
let enCours = null

// Paquet de l'appareil, mis a jour depuis le serveur s'il a plus de 10 minutes (ou si force)
export async function paquetScolarite({ force = false } = {}) {
  if (!enMemoire) enMemoire = await lirePaquet(NOM)
  if (force || !enMemoire || Date.now() - (enMemoire.garde || 0) > FRAICHEUR) {
    enCours ??= api
      .get('/api/scolarite/hors-ligne')
      .then(async (r) => {
        enMemoire = { ...r.data, garde: Date.now() }
        await garderPaquet(NOM, r.data)
        return enMemoire
      })
      .catch(() => enMemoire)
      .finally(() => {
        enCours = null
      })
    return enCours
  }
  return enMemoire
}

const sans = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Encaissements faits sans reseau, pas encore envoyes
export const encaissementsEnAttente = () => envoisEnAttente().filter((x) => x.path === '/api/scolarite/encaissements')

export function eleveDe(p, id) {
  const e = p?.eleves.find((x) => String(x[0]) === String(id))
  return e ? { id: e[0], nom: e[1], prenom: e[2], classe: e[3], matricule: e[4] } : null
}

export function rechercher(p, q, classe) {
  if (!p) return []
  const t = sans(q).trim()
  return p.eleves
    .filter((e) => (classe ? e[3] === classe : true) && (!t || sans(`${e[1]} ${e[2]} ${e[4]}`).includes(t)))
    .slice(0, 80)
    .map((e) => ({ id: e[0], last_name: e[1], first_name: e[2], class_name: e[3] }))
}

// Situation d'un eleve, calculee sur l'appareil (memes regles que le serveur), encaissements en attente compris
export function situationLocale(p, id) {
  const e = eleveDe(p, id)
  if (!e) return null
  const cl = sans(e.classe)
  const vaPour = (f) => !f.classes || !f.classes.length || f.classes.some((x) => cl === sans(x) || cl.startsWith(`${sans(x)} `))
  const payes = new Map()
  for (const [s, f, m] of p.payes) if (s === e.id) payes.set(f, (payes.get(f) || 0) + m)
  for (const x of encaissementsEnAttente()) {
    if (String(x.body.studentId) !== String(e.id)) continue
    for (const l of x.body.lignes) payes.set(l.fraisId, (payes.get(l.fraisId) || 0) + l.montant)
  }
  const frais = p.frais.filter(vaPour).map((f) => {
    const paye = payes.get(f.id) || 0
    return { ...f, paye, reste: Math.max(0, f.montant - paye) }
  })
  const oblig = frais.filter((f) => f.obligatoire)
  const resteOblig = oblig.reduce((s, f) => s + f.reste, 0)
  const auj = new Date().toISOString().slice(0, 10)
  return {
    horsLigne: p.le,
    statut: !oblig.length ? 'aucun' : resteOblig === 0 ? 'regle' : oblig.some((f) => f.paye > 0) ? 'partiel' : 'non_paye',
    resteObligatoire: resteOblig,
    enRetard: oblig.some((f) => f.reste > 0 && f.echeance && String(f.echeance).slice(0, 10) < auj),
    eleve: { id: e.id, nom: e.nom, prenom: e.prenom, classe: e.classe },
    matricule: e.matricule,
    frais,
    total: frais.reduce((s, f) => s + f.montant, 0),
    paye: frais.reduce((s, f) => s + Math.min(f.paye, f.montant), 0),
    reste: frais.reduce((s, f) => s + f.reste, 0),
    paiements: [],
  }
}

export function parMatricule(p, m) {
  const t = String(m || '').toUpperCase().replace(/\s+/g, '').replace(/^\d+-/, '')
  const e = p?.eleves.find((x) => String(x[4]).toUpperCase().replace(/\s+/g, '') === t)
  return e ? situationLocale(p, e[0]) : null
}

// Recu verifie sur l'appareil : numero Sukul (ou recu papier / bordereau) et code imprime
export function recuLocal(p, numero, code) {
  const n = String(numero || '').toUpperCase()
  const r = p?.recus.find((x) => String(x[0]).toUpperCase() === n) || p?.recus.find((x) => String(x[7] || '').toUpperCase() === n)
  if (!r) return null
  const [num, montant, cle, eleve, fraisId, d, mode] = r
  const e = eleveDe(p, eleve)
  const f = p.frais.find((x) => x.id === fraisId)
  const paye = p.payes.filter(([s, fr]) => s === eleve && fr === fraisId).reduce((a, x) => a + x[2], 0)
  return {
    id: null,
    numero: num,
    codeOk: code ? String(code).toUpperCase() === cle : null,
    eleve: { id: eleve, nom: e ? `${e.nom} ${e.prenom}` : '—', classe: e?.classe, matricule: e?.matricule },
    frais: f?.nom || '—',
    montant,
    mode,
    date: d,
    fraisMontant: f?.montant || 0,
    fraisPaye: Math.min(paye, f?.montant || 0),
    fraisReste: Math.max(0, (f?.montant || 0) - paye),
    horsLigne: p.le,
  }
}
