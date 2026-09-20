import { useSyncExternalStore } from 'react'

// Routage par « # » : aucune configuration serveur nécessaire sur Vercel.
const subscribe = (callback) => {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}
const snapshot = () => window.location.hash.slice(1).split('?')[0] || '/'

export const usePath = () => useSyncExternalStore(subscribe, snapshot, snapshot)
export const navigate = (to) => {
  window.location.hash = to
}
