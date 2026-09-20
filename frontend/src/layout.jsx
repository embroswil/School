import { useAuth } from './auth.jsx'

const ADMIN_NAV = [
  ['/', 'Accueil'],
  ['/utilisateurs', 'Utilisateurs'],
  ['/classes', 'Classes'],
  ['/annees', 'Années'],
]

export default function Shell({ path, children }) {
  const { user, logout } = useAuth()
  const items = user.role === 'admin' ? ADMIN_NAV : []
  const isCurrent = (to) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`))

  return (
    <div className={items.length ? 'app' : 'app app-solo'}>
      <header className="topbar">
        <span className="brand">School</span>
        <div className="who">
          <a href="#/compte" title="Mon compte">
            {user.firstName}
          </a>
          <button type="button" onClick={logout}>
            Se déconnecter
          </button>
        </div>
      </header>

      {items.length > 0 && (
        <nav className="nav" aria-label="Navigation principale">
          {items.map(([to, label]) => (
            <a key={to} href={`#${to}`} aria-current={isCurrent(to) ? 'page' : undefined}>
              <span>{label}</span>
            </a>
          ))}
        </nav>
      )}

      <div className="sheet-wrap">
        <main className="sheet">{children}</main>
      </div>
    </div>
  )
}
