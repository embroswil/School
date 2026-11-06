// ordinateur.jsx
// Version ordinateur : active automatiquement sur un vrai ordinateur (grand ecran + souris),
// ou forcee depuis le Profil pour la voir sur un telephone (apercu en pleine largeur).
const CLE = 'school-version-ordi'
const requete = '(min-width: 1024px) and (hover: hover) and (pointer: fine)'

export const ordiForce = () => {
  try {
    return localStorage.getItem(CLE) === '1'
  } catch (_) {
    return false
  }
}

// « Version pour ordinateur » demandee dans Safari ou Chrome sur iPhone / iPad : le navigateur
// se presente alors comme un Mac (MacIntel) tout en ayant un ecran tactile.
const versionOrdiDuNavigateur = () => navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
const petitEcran = () => Math.min(window.screen?.width || 0, window.screen?.height || 0) < 600

export function appliquerVersionOrdi() {
  const mq = window.matchMedia?.(requete)
  const maj = () => {
    // Sur iPhone, « Version pour ordinateur » du navigateur affiche la version ordinateur de School
    const force = ordiForce() || (versionOrdiDuNavigateur() && petitEcran())
    document.documentElement.classList.toggle('ordi', force || Boolean(mq?.matches))
    // Apercu sur telephone : la page est dessinee comme sur un ecran d'ordinateur, puis reduite
    const meta = document.querySelector('meta[name="viewport"]')
    if (meta) {
      meta.setAttribute(
        'content',
        force && !mq?.matches ? 'width=1280, viewport-fit=cover' : 'width=device-width, initial-scale=1, viewport-fit=cover',
      )
    }
  }
  maj()
  mq?.addEventListener?.('change', maj)
}

export function basculerVersionOrdi(actif) {
  try {
    if (actif) localStorage.setItem(CLE, '1')
    else localStorage.removeItem(CLE)
  } catch (_) {}
  window.location.reload()
}
