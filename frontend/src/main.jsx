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

// Nouvelle version en ligne : mise a jour discrete, sans annonce.
// La version en ligne est deja gardee par le service worker pour la prochaine ouverture. En plus, elle est
// chargee pendant que l'application est en arriere-plan (l'utilisateur ne voit rien, et sur iPhone la barre
// d'etat ne clignote pas), sauf si une saisie est en cours sur la page : rien n'est jamais perdu.
if ('serviceWorker' in navigator) {
  let nouvelle = false
  // texte saisi sur la page (formulaire, message, note…) : on attend, la mise a jour se fera plus tard
  const saisieEnCours = () =>
    [...document.querySelectorAll('textarea, input:not([type]), input[type="text"], input[type="number"], input[type="email"], input[type="tel"]')].some(
      (el) => !el.readOnly && !el.disabled && el.value.trim() !== '',
    ) || Boolean(document.querySelector('[contenteditable="true"]:not(:empty)'))
  const appliquer = () => {
    if (nouvelle && document.visibilityState === 'hidden' && !saisieEnCours()) window.location.reload()
  }
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type !== 'nouvelle-version') return
    nouvelle = true
    appliquer()
  })
  document.addEventListener('visibilitychange', appliquer)
}

