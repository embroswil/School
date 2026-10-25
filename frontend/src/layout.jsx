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
    ['/enseignants', '✅', 'Enseignants'],
    ['/classes', '📚', 'Classes'],
    ['/annees', '📅', 'Années'],
    ['/compte', '⚙️', 'Compte'],
  ],
  teacher: [
    ['/', '🏠', 'Accueil'],
    ['/compte', '⚙️', 'Compte'],
  ],
  parent: [
    ['/', '🏠', 'Accueil'],
    ['/compte', '⚙️', 'Compte'],
  ],
  student: [
    ['/', '🏠', 'Accueil'],
    ['/compte', '⚙️', 'Compte'],
  ],
}

export default function Shell({ path, children }) {
  const { user, logout } = useAuth()
  const items = NAV[user.role] || NAV.parent
  const isCurrent = (to) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`))

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          School<span>.</span>
        </span>
        <div className="who">
          <button type="button" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </header>

      <nav className="nav" aria-label="Navigation principale">
        {items.map(([to, ico, label]) => (
          <a key={to} href={`#${to}`} aria-current={isCurrent(to) ? 'page' : undefined}>
            <span className="ico" aria-hidden="true">
              {ico}
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
