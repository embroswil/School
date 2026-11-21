// Prechargement pour le travail sans reseau : a chaque ouverture avec reseau, les pages utiles de chaque espace
// sont chargees en arriere-plan et gardees sur l'appareil (meme sans les avoir ouvertes).
import { api, session } from './api.js'
import { garderCopie } from './horsligne.js'
import { paquetScolarite } from './paquet.js'

const jour = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
async function garder(path) {
  try {
    const r = await api.get(path)
    garderCopie(path, { data: r.data ?? null, meta: r.meta ?? null })
    return r.data
  } catch {
    return null
  }
}

let fait = ''
export async function precharger() {
  const u = session.get()?.user
  if (!u || navigator.onLine === false) return
  const cle = `${u.id}|${u.role}|${u.schoolId}|${jour()}`
  if (fait === cle) return
  fait = cle
  const communs = ['/api/boite/messages', '/api/boite/notifications']
  if (u.role === 'teacher') {
    await Promise.all([...communs, '/api/presence-enseignants/mes-cours', `/api/presence-enseignants/mes-cours?date=${jour()}`, '/api/vie-scolaire/emplois/moi', '/api/inscriptions/mes-etablissements'].map(garder))
    const classes = (await garder('/api/notes/mes-classes')) || []
    for (const c of classes.slice(0, 20)) {
      // une classe apres l'autre : le reseau reste disponible pour l'utilisateur
      await garder(`/api/notes/classes/${c.id}`)
      await garder(`/api/notes/appel/${c.id}?date=${jour()}`)
      await garder(`/api/notes/classes/${c.id}/devoirs`)
    }
  } else if (u.role === 'principal') {
    await Promise.all([...communs, '/api/etablissement/tableau', '/api/etablissement/classes', `/api/presence-enseignants?date=${jour()}`].map(garder))
    await paquetScolarite({ force: true })
  } else if (u.role === 'parent' || u.role === 'student') {
    await garder('/api/boite/messages')
    const eleves = (await garder('/api/suivi/eleves')) || []
    for (const e of (Array.isArray(eleves) ? eleves : []).slice(0, 6)) {
      await garder(`/api/suivi/eleves/${e.id}/notes`)
      await garder(`/api/suivi/eleves/${e.id}/devoirs`)
      await garder(`/api/suivi/eleves/${e.id}/presences`)
      await garder(`/api/vie-scolaire/emplois/moi?eleve=${e.id}`)
    }
  }
}
