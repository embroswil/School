import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { demarrerTraduction } from './i18n.jsx'
import { appliquerVersionOrdi } from './ordinateur.jsx'

// Francais ou anglais (avant le premier affichage)
demarrerTraduction()
appliquerVersionOrdi()

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
  } catch (_) {
    /* stockage indisponible */
  }
  el.classList.add('fini')
  setTimeout(() => el.classList.add('parti'), 200)
  setTimeout(() => el.remove(), 450)
}
requestAnimationFrame(() => setTimeout(retirer, Math.max(200, 1200 - performance.now())))

// Nouvelle version en ligne : l'application s'ouvre tout de suite avec la copie gardee sur l'appareil.
// Si une version plus recente arrive pendant l'ecran de demarrage, elle est chargee aussitot,
// sous cet ecran (une seule fois) ; sinon elle sera utilisee a la prochaine ouverture.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type !== 'nouvelle-version') return
    const el = document.getElementById('demarrage')
    if (!el || el.classList.contains('fini')) return
    try {
      if (sessionStorage.getItem('sukul-maj')) return
      sessionStorage.setItem('sukul-maj', '1')
    } catch (_) {
      return
    }
    window.location.reload()
  })
}
