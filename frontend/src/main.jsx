import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Ecran de demarrage : il disparait en fondu des que l'application est prete
// (au moins 0,9 s apres l'ouverture, pour un lancement doux et sans clignotement)
const retirer = () => {
  const el = document.getElementById('demarrage')
  if (!el) return
  el.classList.add('fini')
  setTimeout(() => el.remove(), 400)
}
requestAnimationFrame(() => setTimeout(retirer, Math.max(150, 900 - performance.now())))
