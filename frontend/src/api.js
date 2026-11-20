import { langue } from './i18n.jsx'
// Petit client pour l'API du backend : ajoute le token, le renouvelle si besoin
// et traduit les messages d'erreur courants en français.

const DIRECT = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '')
const CLE_RELAIS = 'sukul-relais'
const surSukul = () => typeof window !== 'undefined' && /(^|\.)sukul\.site$/.test(window.location.hostname)
let relais = (() => {
  try {
    return surSukul() && localStorage.getItem(CLE_RELAIS) === '1'
  } catch {
    return false
  }
})()

// Adresse du serveur. Certains reseaux mobiles n'arrivent pas a joindre l'adresse du serveur (Render) :
// sur cet appareil, les demandes passent alors par sukul.site, qui les transmet au serveur (vercel.json).
export const apiBase = () => (relais ? '' : DIRECT)
export const urlApi = (chemin) => `${apiBase()}${chemin}`

// Appele quand le serveur n'a pas pu etre joint : si le serveur est joignable par sukul.site mais pas
// directement, cet appareil passe par sukul.site (choix garde). Vrai si le passage vient d'etre active.
let essaiRelais = null
function activerRelais() {
  if (relais || !surSukul()) return Promise.resolve(false)
  essaiRelais ??= (async () => {
    try {
      await fetchAvecDelai(`${DIRECT}/health`, { cache: 'no-store' }, 8000)
      return false // le serveur repond directement : la panne est ailleurs
    } catch {
      /* serveur injoignable directement */
    }
    try {
      await fetchAvecDelai('/api/joignable', { cache: 'no-store' }, 15000)
      relais = true
      try {
        localStorage.setItem(CLE_RELAIS, '1')
      } catch {
        /* stockage indisponible */
      }
      return true
    } catch {
      return false
    }
  })().finally(() => {
    essaiRelais = null
  })
  return essaiRelais
}
const KEY = 'school.session'

export const session = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(KEY))
    } catch {
      return null
    }
  },
  set(value) {
    localStorage.setItem(KEY, JSON.stringify(value))
  },
  clear() {
    localStorage.removeItem(KEY)
  },
}

const MESSAGES = {
  'Invalid email or password': 'E-mail ou mot de passe incorrect.',
  'Account is deactivated': 'Ce compte est désactivé. Contactez l’administration de l’école.',
  'Compte non validé': 'Votre compte n’est pas encore validé par l’établissement.',
  'Email already in use': 'Cette adresse e-mail est déjà utilisée.',
  'Authentication required': 'Votre session a expiré. Reconnectez-vous.',
  'Invalid token': 'Votre session a expiré. Reconnectez-vous.',
  'Token expired': 'Votre session a expiré. Reconnectez-vous.',
  'Invalid or expired refresh token': 'Votre session a expiré. Reconnectez-vous.',
  'You do not have permission to perform this action': 'Vous n’avez pas le droit d’effectuer cette action.',
  'A valid email is required': 'Saisissez une adresse e-mail valide.',
  'Email and password are required': 'Saisissez votre e-mail et votre mot de passe.',
  'First name and last name are required': 'Le prénom et le nom sont obligatoires.',
  'Current password is incorrect': 'Le mot de passe actuel est incorrect.',
  'Current password is required': 'Saisissez votre mot de passe actuel.',
  'You cannot deactivate your own account': 'Vous ne pouvez pas désactiver votre propre compte.',
  'Class with this level and section already exists in this academic year':
    'Cette classe (niveau et section) existe déjà pour cette année scolaire.',
  'Name, academic year, and level are required': 'Le nom, l’année scolaire et le niveau sont obligatoires.',
  'Academic year with this name already exists': 'Une année scolaire porte déjà ce nom.',
  'End date must be after start date': 'La date de fin doit être après la date de début.',
  'Name, start date, and end date are required': 'Le nom, la date de début et la date de fin sont obligatoires.',
  'Resource already exists': 'Cet élément existe déjà.',
  'Internal server error': 'Le serveur a rencontré un problème. Réessayez dans un instant.',
}

const PATTERNS = [
  [/^Too many failed attempts/, 'Trop de tentatives échouées. Réessayez dans 15 minutes.'],
  [/^(New p|P)assword must be at least (\d+)/, 'Le mot de passe doit contenir au moins $2 caractères.'],
  [/^Role must be one of/, 'Choisissez un rôle valide.'],
]

export function translate(message) {
  if (!message) return ''
  if (MESSAGES[message]) return MESSAGES[message]
  for (const [pattern, replacement] of PATTERNS) {
    if (pattern.test(message)) return message.replace(pattern, replacement)
  }
  return message
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

let refreshing = null

// Une demande sans reponse ne doit jamais bloquer l'ecran : sur les reseaux mobiles, une connexion peut
// mourir sans prevenir (le telephone attend alors indefiniment). Passe ce delai, la demande est abandonnee.
const DELAI_LECTURE = 20000
const DELAI_ENVOI = 120000 // lecture de documents par le serveur : peut prendre une minute
function fetchAvecDelai(url, options, delai) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null
  let minuterie
  const limite = new Promise((_, non) => {
    minuterie = setTimeout(() => {
      ctrl?.abort()
      non(Object.assign(new Error('delai'), { delai: true }))
    }, delai)
  })
  // la reponse est lue entierement dans le delai (une connexion peut aussi se couper en cours de lecture)
  const lecture = fetch(url, { ...options, signal: ctrl?.signal }).then(async (rep) => {
    const texte = await rep.text()
    const vide = [101, 204, 205, 304].includes(rep.status)
    return new Response(vide ? null : texte, { status: rep.status, statusText: rep.statusText, headers: rep.headers })
  })
  return Promise.race([lecture, limite]).finally(() => clearTimeout(minuterie))
}

// Nouvelle session depuis le serveur (profil a jour : etablissement rattache, role…)
export async function renewSession() {
  const current = session.get()
  if (!current?.refreshToken) return false
  try {
    let res
    try {
      res = await fetchAvecDelai(
        `${apiBase()}/api/auth/refresh`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: current.refreshToken }) },
        DELAI_LECTURE,
      )
    } catch {
      return false // reseau : la session reste, on reessaiera plus tard
    }
    if (!res.ok) throw new Error('refresh failed')
    const { data } = await res.json()
    session.set({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user })
    return true
  } catch {
    session.clear()
    window.dispatchEvent(new Event('school:logout'))
    return false
  }
}

async function request(path, { method = 'GET', body, auth = true, retry = true, delai, rejouable = method === 'GET' } = {}) {
  const current = session.get()
  // Langue de l'application : le serveur l'utilise pour les notifications, alertes et emails
  const headers = { 'Content-Type': 'application/json', 'X-Langue': langue }
  if (auth && current?.accessToken) headers.Authorization = `Bearer ${current.accessToken}`

  let res
  // Le serveur peut etre en train de redemarrer (mise a jour) : on reessaie deux fois avant d'abandonner.
  // Sans reponse du tout, seules les lectures (GET) sont renvoyees : un envoi a peut-etre deja ete enregistre.
  for (let essai = 0; ; essai++) {
    // telephone sans connexion (mode avion, plus de donnees) : inutile d'attendre
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ApiError('Pas de connexion Internet.', 0)
    let reseau = false
    let coupe = false
    try {
      res = await fetchAvecDelai(
        apiBase() + path,
        { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
        delai || (method === 'GET' ? DELAI_LECTURE : DELAI_ENVOI),
      )
    } catch (err) {
      reseau = true
      coupe = Boolean(err?.delai)
      // reseau qui bloque l'adresse du serveur : on reessaie aussitot par sukul.site
      if (await activerRelais()) {
        essai--
        continue
      }
    }
    const indisponible = reseau ? rejouable : [502, 503].includes(res.status)
    // connexion coupee : un seul nouvel essai (une nouvelle connexion est ouverte), sans attendre
    if (!indisponible || essai >= (coupe ? 1 : 2)) {
      if (coupe) throw new ApiError('La connexion au serveur a été interrompue. Vérifiez votre connexion, puis réessayez.', 0)
      if (reseau) throw new ApiError('Le serveur ne répond pas pour le moment. Vérifiez votre connexion, puis réessayez dans une minute.', 0)
      break
    }
    if (!coupe) await new Promise((ok) => setTimeout(ok, 3000 * (essai + 1)))
  }

  if (res.status === 401 && auth && retry && current?.refreshToken) {
    refreshing ??= renewSession().finally(() => {
      refreshing = null
    })
    if (await refreshing) return request(path, { method, body, auth, retry: false })
  }

  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(translate(payload?.message) || `Erreur ${res.status}`, res.status)
  }
  return payload ?? {}
}

export const api = {
  get: (path) => request(path),
  post: (path, body, options) => request(path, { method: 'POST', body: body ?? {}, ...options }),
  put: (path, body, options) => request(path, { method: 'PUT', body: body ?? {}, ...options }),
  patch: (path, body) => request(path, { method: 'PATCH', body: body ?? {} }),
  delete: (path, body) => request(path, body ? { method: 'DELETE', body } : { method: 'DELETE' }),
}
