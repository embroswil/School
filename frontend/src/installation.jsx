import { useEffect, useState } from 'react'

// Installation de School sur l'ecran d'accueil du telephone.
// Android / Chrome / Edge : vraie fenetre d'installation (evenement beforeinstallprompt,
// capture des le chargement de la page dans index.html). iPhone / iPad : Apple n'autorise
// pas de bouton d'installation ; on montre les 3 gestes a faire dans Safari.

const estInstallee = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
const estIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const CLE = 'school-installation-masquee'

export function useInstallation() {
  const [evenement, setEvenement] = useState(() => window.__installSchool || null)
  const [installee, setInstallee] = useState(estInstallee)
  useEffect(() => {
    const prendre = (e) => {
      e.preventDefault()
      window.__installSchool = e
      setEvenement(e)
    }
    const fini = () => {
      setInstallee(true)
      setEvenement(null)
    }
    window.addEventListener('beforeinstallprompt', prendre)
    window.addEventListener('appinstalled', fini)
    window.addEventListener('school-installable', () => setEvenement(window.__installSchool))
    return () => {
      window.removeEventListener('beforeinstallprompt', prendre)
      window.removeEventListener('appinstalled', fini)
    }
  }, [])
  const mode = installee ? 'installee' : evenement ? 'bouton' : estIOS() ? 'ios' : 'autre'
  async function installer() {
    if (!evenement) return false
    evenement.prompt()
    const choix = await evenement.userChoice.catch(() => null)
    window.__installSchool = null
    setEvenement(null)
    if (choix?.outcome === 'accepted') setInstallee(true)
    return true
  }
  return { mode, installer }
}

// Icone « Partager » d'iOS
const Partager = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
)

// Les gestes a faire, selon le telephone
export function EtapesInstallation({ mode }) {
  if (mode === 'ios') {
    return (
      <ol className="etapes-install">
        <li>
          <span className="num">1</span>
          <span>
            Ouvrez School dans <b>Safari</b>, puis touchez <b className="pictos"><Partager /></b> <b>Partager</b>, en bas de l’écran.
          </span>
        </li>
        <li>
          <span className="num">2</span>
          <span>
            Faites défiler et touchez <b>« Sur l’écran d’accueil »</b> (ou « Ajouter à l’écran d’accueil »).
          </span>
        </li>
        <li>
          <span className="num">3</span>
          <span>
            Touchez <b>Ajouter</b>, en haut à droite. L’icône <b>School</b> apparaît avec vos applications.
          </span>
        </li>
      </ol>
    )
  }
  return (
    <ol className="etapes-install">
      <li>
        <span className="num">1</span>
        <span>
          Ouvrez School dans <b>Chrome</b>, puis touchez le menu <b>⋮</b>, en haut à droite.
        </span>
      </li>
      <li>
        <span className="num">2</span>
        <span>
          Touchez <b>« Installer l’application »</b> (ou « Ajouter à l’écran d’accueil »).
        </span>
      </li>
      <li>
        <span className="num">3</span>
        <span>
          Confirmez avec <b>Installer</b>. L’icône <b>School</b> apparaît avec vos applications.
        </span>
      </li>
    </ol>
  )
}

// Bouton d'installation : fenetre native si possible, sinon la page des gestes
export function BoutonInstaller({ className = 'btn btn-block', texte = '📲 Installer l’application' }) {
  const { mode, installer } = useInstallation()
  if (mode === 'installee') return null
  return (
    <button type="button" className={className} onClick={async () => (await installer()) || (window.location.hash = '/installer')}>
      {texte}
    </button>
  )
}

// Bandeau discret en haut de l'accueil (masquable 14 jours)
export function BandeauInstallation() {
  const { mode, installer } = useInstallation()
  const [masque, setMasque] = useState(() => {
    try {
      return Number(localStorage.getItem(CLE) || 0) > Date.now()
    } catch (_) {
      return false
    }
  })
  if (mode === 'installee' || masque) return null
  const fermer = () => {
    try {
      localStorage.setItem(CLE, String(Date.now() + 14 * 86400000))
    } catch (_) {}
    setMasque(true)
  }
  return (
    <div className="bandeau-install">
      <img src="/icons/icon-192.png" alt="" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>Installez School</b>
        <small>Sur votre écran d’accueil, comme une application.</small>
      </div>
      <button type="button" className="btn" style={{ padding: '8px 12px', fontSize: 13 }} onClick={async () => (await installer()) || (window.location.hash = '/installer')}>
        Installer
      </button>
      <button type="button" className="fermer" onClick={fermer} aria-label="Plus tard">
        ×
      </button>
    </div>
  )
}

// Page complete « Installer School »
export default function PageInstallation() {
  const { mode, installer } = useInstallation()
  const [vue, setVue] = useState(mode === 'ios' ? 'ios' : 'android')
  return (
    <div className="page-install">
      <img src="/icons/icon-512.png" alt="" className="logo-install" />
      <h1 className="page-title" style={{ textAlign: 'center' }}>
        Installer School
      </h1>
      {mode === 'installee' ? (
        <p className="lede" style={{ textAlign: 'center' }}>
          ✓ School est déjà installé sur cet appareil. Ouvrez-le depuis son icône.
        </p>
      ) : (
        <>
          <p className="lede" style={{ textAlign: 'center' }}>
            Une icône sur votre écran d’accueil, l’application en plein écran, et les nouvelles de l’école en un geste. Gratuit, sans passer par un store, et
            sans occuper de place.
          </p>
          {mode === 'bouton' && (
            <button type="button" className="btn btn-block" style={{ marginBottom: 16 }} onClick={installer}>
              📲 Installer maintenant
            </button>
          )}
          <div className="chips" style={{ justifyContent: 'center', marginBottom: 12 }}>
            <button type="button" className="chip" aria-pressed={vue === 'ios'} onClick={() => setVue('ios')}>
              iPhone / iPad
            </button>
            <button type="button" className="chip" aria-pressed={vue === 'android'} onClick={() => setVue('android')}>
              Android
            </button>
          </div>
          <div className="card">
            <EtapesInstallation mode={vue} />
          </div>
          <p className="muted" style={{ fontSize: 13, textAlign: 'center', marginTop: 12 }}>
            Sur ordinateur (Chrome ou Edge) : cliquez sur l’icône d’installation à droite de la barre d’adresse.
          </p>
        </>
      )}
    </div>
  )
}
