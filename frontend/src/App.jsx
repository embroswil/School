import { useEffect } from 'react'
import { AuthProvider, useAuth } from './auth.jsx'
import { usePath } from './router.js'
import Shell from './layout.jsx'
import Login from './pages/Login.jsx'
import Home from './pages/Home.jsx'
import Account from './pages/Account.jsx'
import Users from './pages/Users.jsx'
import Classes from './pages/Classes.jsx'
import ClassDetail from './pages/ClassDetail.jsx'
import Years from './pages/Years.jsx'

function Message({ title, children }) {
  return (
    <>
      <h1 className="page-title">{title}</h1>
      <p className="lede">{children}</p>
    </>
  )
}

function Pages({ path }) {
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
  const adminOnly = (page) =>
    isAdmin ? page : <Message title="Accès réservé">Cette page est réservée à l’administration de l’école.</Message>

  if (path === '/') return <Home />
  if (path === '/compte') return <Account />
  if (path === '/utilisateurs') return adminOnly(<Users />)
  if (path === '/classes') return adminOnly(<Classes />)
  if (path === '/annees') return adminOnly(<Years />)

  const classMatch = path.match(/^\/classes\/(\d+)$/)
  if (classMatch) return adminOnly(<ClassDetail key={classMatch[1]} id={Number(classMatch[1])} />)

  return (
    <Message title="Page introuvable">
      Cette page n’existe pas. <a href="#/">Retourner à l’accueil</a>.
    </Message>
  )
}

function Root() {
  const { user } = useAuth()
  const path = usePath()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [path])

  if (!user) return <Login />
  return (
    <Shell path={path}>
      <Pages path={path} />
    </Shell>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  )
}
