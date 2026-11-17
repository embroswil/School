// theme.js
// Theme de l'application : sombre (par defaut), clair, ou automatique (suit le reglage du telephone).
// Le choix est garde sur l'appareil ; il est applique avant l'affichage par un petit script dans index.html.
const CLE = 'sukul-theme'
const CHOIX = ['sombre', 'clair', 'auto']

export function lireTheme() {
  try {
    const t = localStorage.getItem(CLE)
    if (CHOIX.includes(t)) return t
  } catch (_) {
    /* stockage indisponible */
  }
  return 'sombre'
}

const systemeClair = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)').matches : false)

export function appliquerTheme(t = lireTheme()) {
  const clair = t === 'clair' || (t === 'auto' && systemeClair())
  document.documentElement.dataset.theme = clair ? 'light' : 'dark'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', clair ? '#f3f5fa' : '#07080b')
}

export function changerTheme(t) {
  try {
    localStorage.setItem(CLE, t)
  } catch (_) {
    /* stockage indisponible */
  }
  appliquerTheme(t)
}

// En mode automatique, l'application suit le passage du telephone en clair ou en sombre
export function suivreSysteme() {
  const mq = window.matchMedia?.('(prefers-color-scheme: light)')
  mq?.addEventListener?.('change', () => {
    if (lireTheme() === 'auto') appliquerTheme('auto')
  })
}
