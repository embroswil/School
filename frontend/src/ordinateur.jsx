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

export function appliquerVersionOrdi() {
  const mq = window.matchMedia?.(requete)
  const maj = () => {
    const force = ordiForce()
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
