import { useEffect, useState } from 'react'
import { api } from './api.js'

// Notifications « push » : abonnement du telephone, et petit encart pour les activer.
const installee = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const versCle = (b64) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

// Inscrit ce telephone aupres du serveur (abonnement cree au besoin). Sans risque si deja fait.
async function synchroniser(cle) {
  const reg = await navigator.serviceWorker.ready
  const abo = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: versCle(cle) }))
  await api.post('/api/push/abonnement', { ...abo.toJSON(), appareil: navigator.userAgent.slice(0, 120) })
}

// A l'ouverture de School : si les alertes sont autorisees, ce telephone est (re)inscrit
export function SynchroPush() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    api
      .get('/api/push/cle')
      .then((r) => r.data.cle && synchroniser(r.data.cle))
      .catch(() => {})
  }, [])
  return null
}

// etat : 'chargement' | 'indisponible' | 'installer' (iPhone : installer School d'abord) | 'refuse' | 'actif' | 'inactif'
export function usePush() {
  const [etat, setEtat] = useState('chargement')
  const [cle, setCle] = useState(null)
  const verifier = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setEtat(ios() && !installee() ? 'installer' : 'indisponible')
      return
    }
    try {
      const k = (await api.get('/api/push/cle')).data.cle
      setCle(k)
      if (!k) return setEtat('indisponible')
      if (Notification.permission === 'denied') return setEtat('refuse')
      if (Notification.permission === 'granted') {
        // Deja autorise : on (re)inscrit ce telephone aupres du serveur, a chaque ouverture
        await synchroniser(k)
        return setEtat('actif')
      }
      setEtat('inactif')
    } catch (_) {
      setEtat('indisponible')
    }
  }
  useEffect(() => {
    verifier()
  }, [])
  async function activer() {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return setEtat(permission === 'denied' ? 'refuse' : 'inactif')
    await synchroniser(cle)
    setEtat('actif')
  }
  async function desactiver() {
    const reg = await navigator.serviceWorker.ready
    const abo = await reg.pushManager.getSubscription()
    if (abo) {
      await api.delete('/api/push/abonnement', { endpoint: abo.endpoint }).catch(() => {})
      await abo.unsubscribe().catch(() => {})
    }
    setEtat('inactif')
  }
  return { etat, activer, desactiver }
}

const CLE = 'school-push-masque'

// Encart sur l'accueil : « Recevoir les alertes sur votre telephone »
export function EncartPush() {
  const { etat, activer } = usePush()
  const [masque, setMasque] = useState(() => {
    try {
      return Number(localStorage.getItem(CLE) || 0) > Date.now()
    } catch (_) {
      return false
    }
  })
  const [erreur, setErreur] = useState('')
  if (masque || !['inactif', 'installer'].includes(etat)) return null
  const fermer = () => {
    try {
      localStorage.setItem(CLE, String(Date.now() + 7 * 86400000))
    } catch (_) {}
    setMasque(true)
  }
  return (
    <div className="bandeau-install" style={{ borderLeftColor: '#ff4d57' }}>
      <span style={{ fontSize: 26 }}>🔔</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>Recevoir les alertes sur votre téléphone</b>
        <small>
          {etat === 'installer'
            ? 'Installez d’abord School sur l’écran d’accueil, puis activez les alertes.'
            : erreur || 'Absences, notes, paiements et messages, même School fermé.'}
        </small>
      </div>
      {etat === 'installer' ? (
        <a className="btn" style={{ padding: '8px 12px', fontSize: 13 }} href="#/installer">
          Installer
        </a>
      ) : (
        <button type="button" className="btn" style={{ padding: '8px 12px', fontSize: 13 }} onClick={() => activer().catch((e) => setErreur(e.message))}>
          Activer
        </button>
      )}
      <button type="button" className="fermer" onClick={fermer} aria-label="Plus tard">
        ×
      </button>
    </div>
  )
}

// Ligne de reglage (Profil)
export { installee }

export function ReglagePush() {
  const { etat, activer, desactiver } = usePush()
  const [erreur, setErreur] = useState('')
  // Seulement dans l'application installee, et seulement tant que les alertes ne sont pas activees
  if (!installee() || !['inactif', 'refuse'].includes(etat)) return null
  const textes = {
    chargement: 'Vérification…',
    indisponible: 'Non disponible sur ce navigateur',
    installer: 'Installez School sur l’écran d’accueil pour les activer (iPhone)',
    refuse: 'Bloquées : autorisez les notifications de School dans les réglages du téléphone',
    actif: 'Activées sur ce téléphone',
    inactif: 'Désactivées sur ce téléphone',
  }
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
      <span style={{ fontSize: 24 }}>🔔</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>Alertes sur le téléphone</b>
        <div className="muted" style={{ fontSize: 13 }}>
          {erreur || textes[etat]}
        </div>
      </div>
      {etat === 'inactif' && (
        <button type="button" className="btn" style={{ padding: '8px 12px', fontSize: 13 }} onClick={() => activer().catch((e) => setErreur(e.message))}>
          Activer
        </button>
      )}
      {etat === 'actif' && (
        <button type="button" className="btn btn-quiet" style={{ padding: '8px 12px', fontSize: 13 }} onClick={desactiver}>
          Couper
        </button>
      )}
      {etat === 'installer' && (
        <a className="btn btn-quiet" style={{ padding: '8px 12px', fontSize: 13 }} href="#/installer">
          Installer
        </a>
      )}
    </div>
  )
}
