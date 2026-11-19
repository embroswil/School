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
    if (e.data?.type !== 'nouvelle-version' || document.querySelector('.maj-dispo')) return
    const a = document.createElement('div')
    a.className = 'maj-dispo'
    a.setAttribute('role', 'status')
    a.innerHTML =
      '<span class="maj-ico" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/></svg></span>' +
      '<span class="maj-texte"><b>Nouvelle version</b><small>Sùkûl a été amélioré : chargez la dernière version.</small></span>' +
      '<button type="button" class="maj-btn">Mettre à jour</button>' +
      '<button type="button" class="maj-fermer" aria-label="Plus tard">×</button>'
    a.querySelector('.maj-btn').addEventListener('click', () => window.location.reload())
    a.querySelector('.maj-fermer').addEventListener('click', () => a.remove())
    setTimeout(() => document.body.appendChild(a), 1500)
  })
}
