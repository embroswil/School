import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { demarrerTraduction } from './i18n.jsx'
import { appliquerVersionOrdi } from './ordinateur.jsx'
import { appliquerTheme, suivreSysteme } from './theme.js'

// Francais ou anglais (avant le premier affichage)
demarrerTraduction()
appliquerVersionOrdi()
// Theme sombre ou clair
appliquerTheme(undefined, { pendantDemarrage: Boolean(document.getElementById('demarrage')) })
suivreSysteme()

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

// Nouvelle version en ligne : l'application s'ouvre tout de suite avec la copie gardee sur l'appareil,
// et la version en ligne est gardee pour la prochaine ouverture. On ne recharge jamais la page de soi-meme :
// sur iPhone, chaque chargement d'une page dans l'application installee fait clignoter la barre d'etat.
// Une discrete annonce propose plutot la mise a jour, que l'utilisateur lance quand il le souhaite.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type !== 'nouvelle-version' || document.querySelector('.annonce-maj')) return
    const a = document.createElement('button')
    a.type = 'button'
    a.className = 'annonce annonce-maj'
    a.innerHTML = '<span>Nouvelle version de Sùkûl disponible</span><b>Mettre à jour</b>'
    a.addEventListener('click', () => window.location.reload())
    setTimeout(() => document.body.appendChild(a), 1500)
  })
}
