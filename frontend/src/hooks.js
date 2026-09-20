import { useEffect, useState } from 'react'
import { api } from './api.js'

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
  return {
    data: key ? state.data : null,
    meta: key ? state.meta : null,
    error: current ? state.error : '',
    loading: key !== null && !current,
    reload: () => setTick((t) => t + 1),
  }
}
