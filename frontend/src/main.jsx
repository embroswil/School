import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { demarrerTraduction } from './i18n.jsx'
import { appliquerVersionOrdi } from './ordinateur.jsx'
import { appliquerTheme, suivreSysteme } from './theme.js'
import { demarrerEnvoisAuto } from './horsligne.js'

// Francais ou anglais (avant le premier affichage)
demarrerTraduction()
appliquerVersionOrdi()
// Theme sombre ou clair
appliquerTheme(undefined, { pendantDemarrage: Boolean(document.getElementById('demarrage')) })
suivreSysteme()

// appels et notes gardes sans reseau : envoyes des que possible
demarrerEnvoisAuto()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Ecran de demarrage : un seul ecran fixe. Quand l'application est prete (au moins 1,2 s apres
// l'ouverture), le logo s'efface sur le fond noir, puis l'application apparait.
const retirer = () => {
  const el = document.getElementById('demarrage')
  if (!el) return
  try {
    sessionStorage.removeItem('sukul-maj')
    sessionStorage.removeItem('sukul-recharge')
  } catch (_) {
    /* stockage indisponible */
  }
  el.classList.add('fini')
  // l'application prend ses couleurs sous l'ecran de demarrage, qui s'efface ensuite en fondu
  setTimeout(() => {
    appliquerTheme()
    el.classList.add('parti')
  }, 200)
  setTimeout(() => el.remove(), 600)
}
requestAnimationFrame(() => setTimeout(retirer, Math.max(200, 1200 - performance.now())))

// Nouvelle version en ligne : appliquee vite, sans annonce et sans jamais perdre une saisie.
// - a l'ouverture : le service worker compare la page gardee et la page en ligne ; si elle a change,
//   l'application se recharge aussitot, encore sous l'ecran de demarrage (dans les 15 premieres secondes) ;
// - ensuite : la version en ligne est verifiee au retour dans l'application et toutes les 5 minutes ;
//   une nouvelle version s'applique au retour dans l'application, au changement de page ou en arriere-plan.
if ('serviceWorker' in navigator) {
  let nouvelle = false
  const ouverture = Date.now()
  // texte saisi sur la page (formulaire, message, note…) : on attend, la mise a jour se fera plus tard
  const saisieEnCours = () =>
    [...document.querySelectorAll('textarea, input:not([type]), input[type="text"], input[type="number"], input[type="email"], input[type="tel"]')].some(
      (el) => !el.readOnly && !el.disabled && el.value.trim() !== '',
    ) || Boolean(document.querySelector('[contenteditable="true"]:not(:empty)'))
  const recharger = () => {
    if (nouvelle && !saisieEnCours()) window.location.reload()
  }
  // script de la version affichee (/assets/index-xxxx.js) ; absent en developpement
  const actuel = document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src')
  let verification = null
  const verifier = async () => {
    if (!actuel || nouvelle || verification) return nouvelle
    verification = (async () => {
      try {
        navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {})
        // passe par le service worker, qui garde aussi cette page pour la prochaine ouverture
        const page = await (await fetch('/', { cache: 'no-store' })).text()
        const enLigne = page.match(/\/assets\/index-[\w-]+\.js/)?.[0]
        if (enLigne && !actuel.includes(enLigne)) nouvelle = true
      } catch (_) {
        /* hors ligne : on reessaiera */
      }
      verification = null
      return nouvelle
    })()
    return verification
  }
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type !== 'nouvelle-version') return
    nouvelle = true
    if (Date.now() - ouverture < 15000 || document.visibilityState === 'hidden') recharger()
  })
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') return recharger()
    if (await verifier()) recharger()
  })
  window.addEventListener('hashchange', recharger)
  setInterval(() => document.visibilityState === 'visible' && verifier(), 5 * 60 * 1000)
}
