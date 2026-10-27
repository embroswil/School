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
import SchoolFiche from './pages/SchoolFiche.jsx'
import TeacherRequests from './pages/TeacherRequests.jsx'
import SchoolSignup from './pages/SchoolSignup.jsx'
import Students from './pages/Students.jsx'
import Notifications from './pages/Notifications.jsx'
import Messages from './pages/Messages.jsx'
import Conversation from './pages/Conversation.jsx'
import Actualites from './pages/Actualites.jsx'
import Scolarite from './pages/Scolarite.jsx'
import ImportEleves from './pages/ImportEleves.jsx'
import ClassNotes from './pages/ClassNotes.jsx'
import Evaluation from './pages/Evaluation.jsx'
import Appel from './pages/Appel.jsx'
import Suivi, { MesNotes } from './pages/Suivi.jsx'
import MesAffectations from './pages/MesAffectations.jsx'
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
  if (path === '/notes') return reserve(['parent', 'student'].includes(user.role), <MesNotes />)
  if (path === '/mes-classes') return reserve(user.role === 'teacher', <MesAffectations />)
  const suiviMatch = path.match(/^\/suivi\/(\d+)$/)
  if (suiviMatch) return reserve(['parent', 'student'].includes(user.role), <Suivi key={suiviMatch[1]} id={Number(suiviMatch[1])} />)
  if (path.split('?')[0] === '/scolarite') return reserve(user.role !== 'teacher', <Scolarite />)
  if (path === '/import-eleves') return reserve(gestion, <ImportEleves />)
  if (path === '/messages') return <Messages />
  const convMatch = path.match(/^\/messages\/(\d+)$/)
  if (convMatch) return <Conversation key={convMatch[1]} id={Number(convMatch[1])} />
  if (path === '/etablissements') return reserve(user.role === 'admin', <Schools />)
  const ficheEcole = path.match(/^\/etablissements\/(\d+)$/)
  if (ficheEcole) return reserve(user.role === 'admin', <SchoolFiche key={ficheEcole[1]} id={Number(ficheEcole[1])} />)
  if (path === '/enseignants') return reserve(gestion, <TeacherRequests />)
  if (path === '/eleves') return reserve(gestion, <Students />)
  if (path === '/utilisateurs') return reserve(gestion, <Users />)
  if (path === '/classes') return reserve(gestion, <Classes />)
  if (path === '/annees') return reserve(gestion, <Years />)

  const eleveMatch = path.match(/^\/eleves\/(\d+)$/)
  if (eleveMatch) return reserve(gestion, <EleveFiche key={eleveMatch[1]} id={Number(eleveMatch[1])} />)
  const notesMatch = path.match(/^\/classes\/(\d+)\/notes$/)
  if (notesMatch) return reserve(gestion || user.role === 'teacher', <ClassNotes key={notesMatch[1]} id={Number(notesMatch[1])} />)
  const appelMatch = path.match(/^\/classes\/(\d+)\/appel$/)
  if (appelMatch) return reserve(gestion || user.role === 'teacher', <Appel key={appelMatch[1]} id={Number(appelMatch[1])} />)
  const evalMatch = path.match(/^\/evaluations\/(\d+)$/)
  if (evalMatch) return reserve(gestion || user.role === 'teacher', <Evaluation key={evalMatch[1]} id={Number(evalMatch[1])} />)
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
