import { useEffect, useState } from 'react'
import { api } from './api.js'
import { useAuth } from './auth.jsx'

// Navigation selon le role
const NAV = {
  admin: [
    ['/', '🏠', 'Accueil'],
    ['/etablissements', '🏫', 'Établissements'],
    ['/utilisateurs', '👥', 'Utilisateurs'],
    ['/compte', '⚙️', 'Compte'],
  ],
  principal: [
    ['/', '🏠', 'Accueil'],
    ['/eleves', '🎒', 'Élèves'],
    ['/enseignants', '👩‍🏫', 'Enseignants'],
    ['/messages', '✉️', 'Messages'],
    ['/compte', '⚙️', 'Compte'],
  ],
  teacher: [
    ['/', '🏠', 'Accueil'],
    ['/actualites', '📣', 'Actualités'],
    ['/messages', '✉️', 'Messages'],
    ['/compte', '⚙️', 'Compte'],
  ],
  parent: [
    ['/', '🏠', 'Accueil'],
    ['/actualites', '📣', 'Actualités'],
    ['/messages', '✉️', 'Messages'],
    ['/compte', '⚙️', 'Compte'],
  ],
  student: [
    ['/', '🏠', 'Accueil'],
    ['/actualites', '📣', 'Actualités'],
    ['/messages', '✉️', 'Messages'],
    ['/compte', '⚙️', 'Compte'],
  ],
}

export default function Shell({ path, children }) {
  const { user, logout } = useAuth()
  const items = NAV[user.role] || NAV.parent
  // Pastilles : notifications et messages non lus (rafraichies a chaque page)
  const [compteurs, setCompteurs] = useState({ notifications: 0, messages: 0 })
  useEffect(() => {
    api
      .get('/api/boite/compteurs')
      .then((r) => setCompteurs(r.data || { notifications: 0, messages: 0 }))
      .catch(() => {})
  }, [path])
  const isCurrent = (to) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`))

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          School<span>.</span>
        </span>
        <div className="who">
          <a href="#/notifications" aria-label="Notifications" style={{ position: 'relative', padding: '8px 12px' }}>
            🔔
            {compteurs.notifications > 0 && (
              <span className="count" style={{ position: 'absolute', top: -6, right: -6 }}>
                {compteurs.notifications}
              </span>
            )}
          </a>
          <button type="button" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </header>

      <nav className="nav" aria-label="Navigation principale">
        {items.map(([to, ico, label]) => (
          <a key={to} href={`#${to}`} aria-current={isCurrent(to) ? 'page' : undefined}>
            <span className="ico" aria-hidden="true" style={{ position: 'relative' }}>
              {ico}
              {to === '/messages' && compteurs.messages > 0 && (
                <span className="count" style={{ position: 'absolute', top: -6, right: -12 }}>
                  {compteurs.messages}
                </span>
              )}
            </span>
            <span>{label}</span>
          </a>
        ))}
      </nav>

      <div className="sheet-wrap">
        <main className="sheet">{children}</main>
      </div>
    </div>
  )
}
