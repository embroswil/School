import { useEffect, useState } from 'react'
import { api, session } from './api.js'

// Dernieres reponses de l'API, gardees en memoire le temps de la visite.
// En revenant sur une page, elle s'affiche tout de suite avec ces donnees,
// puis se met a jour des que la nouvelle reponse arrive (rien ne clignote).
const memoire = new Map()
const MAX = 80
const cle = (path) => {
  const u = session.get()?.user
  return `${u?.id || 0}|${u?.espace || ''}|${path}`
}
const garder = (path, valeur) => {
  const k = cle(path)
  memoire.delete(k)
  memoire.set(k, valeur)
  if (memoire.size > MAX) memoire.delete(memoire.keys().next().value)
}

// Charge une URL de l'API. Passer null pour ne rien charger.
// `reload()` relance la requête en gardant les anciennes données à l'écran.
export function useApi(path) {
  const [state, setState] = useState({ key: null, data: null, meta: null, error: '' })
  const [tick, setTick] = useState(0)
  const key = path ? `${path}#${tick}` : null

  useEffect(() => {
    if (!path) return undefined
    let live = true
    const done = `${path}#${tick}`
    api.get(path).then(
      (res) => {
        garder(path, { data: res.data ?? null, meta: res.meta ?? null })
        if (live) setState({ key: done, data: res.data ?? null, meta: res.meta ?? null, error: '' })
      },
      (err) => {
        if (live) setState({ key: done, data: null, meta: null, error: err.message })
      },
    )
    return () => {
      live = false
    }
  }, [path, tick])

  const current = key !== null && state.key === key
  const memePage = path && state.key && state.key.slice(0, state.key.lastIndexOf('#')) === path
  const enMemoire = path && !current && !memePage ? memoire.get(cle(path)) : null
  return {
    data: !key ? null : enMemoire ? enMemoire.data : state.data,
    meta: !key ? null : enMemoire ? enMemoire.meta : state.meta,
    error: current ? state.error : '',
    loading: key !== null && !current && !enMemoire,
    reload: () => setTick((t) => t + 1),
  }
}
