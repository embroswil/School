import { useEffect } from 'react'
import { AuthProvider, useAuth } from './auth.jsx'
import { usePath } from './router.js'
import Shell from './layout.jsx'
import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Home from './pages/Home.jsx'
import Account from './pages/Account.jsx'
import Users from './pages/Users.jsx'
import Classes from './pages/Classes.jsx'
import ClassDetail from './pages/ClassDetail.jsx'
import Years from './pages/Years.jsx'
import Schools from './pages/Schools.jsx'
import TeacherRequests from './pages/TeacherRequests.jsx'
import SchoolSignup from './pages/SchoolSignup.jsx'
import Students from './pages/Students.jsx'
import Notifications from './pages/Notifications.jsx'
import Messages from './pages/Messages.jsx'
import Conversation from './pages/Conversation.jsx'
import Actualites from './pages/Actualites.jsx'
import Scolarite from './pages/Scolarite.jsx'
import ImportEleves from './pages/ImportEleves.jsx'
import EleveFiche from './pages/EleveFiche.jsx'

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
  const gestion = user.role === 'admin' || user.role === 'principal'
  const reserve = (ok, page) =>
    ok ? page : <Message title="Accès réservé">Cette page est réservée à l’administration.</Message>

  if (path === '/') return <Home />
  if (path === '/compte') return <Account />
  if (path === '/notifications') return <Notifications />
  if (path === '/actualites') return <Actualites />
  if (path.split('?')[0] === '/scolarite') return reserve(user.role !== 'teacher', <Scolarite />)
  if (path === '/import-eleves') return reserve(gestion, <ImportEleves />)
  if (path === '/messages') return <Messages />
  const convMatch = path.match(/^\/messages\/(\d+)$/)
  if (convMatch) return <Conversation key={convMatch[1]} id={Number(convMatch[1])} />
  if (path === '/etablissements') return reserve(user.role === 'admin', <Schools />)
  if (path === '/enseignants') return reserve(gestion, <TeacherRequests />)
  if (path === '/eleves') return reserve(gestion, <Students />)
  if (path === '/utilisateurs') return reserve(gestion, <Users />)
  if (path === '/classes') return reserve(gestion, <Classes />)
  if (path === '/annees') return reserve(gestion, <Years />)

  const eleveMatch = path.match(/^\/eleves\/(\d+)$/)
  if (eleveMatch) return reserve(gestion, <EleveFiche key={eleveMatch[1]} id={Number(eleveMatch[1])} />)
  const classMatch = path.match(/^\/classes\/(\d+)$/)
  if (classMatch) return reserve(gestion, <ClassDetail key={classMatch[1]} id={Number(classMatch[1])} />)

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

  if (!user) {
    if (path === '/connexion') return <Login />
    if (path === '/inscription') return <Signup />
    if (path === '/inscrire-etablissement') return <SchoolSignup />
    return <Landing />
  }
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
