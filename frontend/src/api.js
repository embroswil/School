// Petit client pour l'API du backend : ajoute le token, le renouvelle si besoin
// et traduit les messages d'erreur courants en français.

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '')
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

async function renewSession() {
  const current = session.get()
  if (!current?.refreshToken) return false
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    })
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

async function request(path, { method = 'GET', body, auth = true, retry = true } = {}) {
  const current = session.get()
  const headers = { 'Content-Type': 'application/json' }
  if (auth && current?.accessToken) headers.Authorization = `Bearer ${current.accessToken}`

  let res
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.', 0)
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
  put: (path, body) => request(path, { method: 'PUT', body: body ?? {} }),
  patch: (path, body) => request(path, { method: 'PATCH', body: body ?? {} }),
  delete: (path) => request(path, { method: 'DELETE' }),
}
