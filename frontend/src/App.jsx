import { useEffect, useState } from 'react'
import { api } from './api.js'
import { AuthProvider, useAuth } from './auth.jsx'
import { usePath } from './router.js'
import Shell from './layout.jsx'
import Secours from './Secours.jsx'
import PremierTheme from './PremierTheme.jsx'
import Didacticiel from './Didacticiel.jsx'
import { Annonces, PageAuth } from './ui.jsx'
import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Home from './pages/Home.jsx'
import Account from './pages/Account.jsx'
import Users from './pages/Users.jsx'
import Classes from './pages/Classes.jsx'
import ClassDetail from './pages/ClassDetail.jsx'
import Schools from './pages/Schools.jsx'
import SchoolFiche from './pages/SchoolFiche.jsx'
import TeacherRequests from './pages/TeacherRequests.jsx'
import SchoolSignup from './pages/SchoolSignup.jsx'
import RejoindreEtablissement from './pages/RejoindreEtablissement.jsx'
import Students from './pages/Students.jsx'
import Notifications from './pages/Notifications.jsx'
import Messages from './pages/Messages.jsx'
import Conversation from './pages/Conversation.jsx'
import Actualites from './pages/Actualites.jsx'
import Scolarite from './pages/Scolarite.jsx'
import Guichet from './pages/Guichet.jsx'
import ImportEleves from './pages/ImportEleves.jsx'
import ImportEnseignants from './pages/ImportEnseignants.jsx'
import Administrateurs from './pages/Administrateurs.jsx'
import ImportEmplois from './pages/ImportEmplois.jsx'
import EmploisDuTemps from './pages/EmploisDuTemps.jsx'
import QuotasIA from './pages/QuotasIA.jsx'
import ImportAbsences from './pages/ImportAbsences.jsx'
import ClassNotes from './pages/ClassNotes.jsx'
import Evaluation from './pages/Evaluation.jsx'
import Appel from './pages/Appel.jsx'
import Suivi, { MesNotes } from './pages/Suivi.jsx'
import MesAffectations from './pages/MesAffectations.jsx'
import Devoirs from './pages/Devoirs.jsx'
import EmploiDuTemps, { MonEmploi } from './pages/EmploiDuTemps.jsx'
import ConseilAnnuel from './pages/ConseilAnnuel.jsx'
import DisciplineImport from './pages/DisciplineImport.jsx'
import Abonnement from './pages/Abonnement.jsx'
import AbonnementsAdmin from './pages/AbonnementsAdmin.jsx'
import Recu from './pages/Recu.jsx'
import RecuScolarite from './pages/RecuScolarite.jsx'
import ReleveScolarite from './pages/ReleveScolarite.jsx'
import VerifierRecu from './pages/VerifierRecu.jsx'
import ImportDossier from './pages/ImportDossier.jsx'
import OrdrePaiement, { ListeOrdres } from './pages/OrdrePaiement.jsx'
import TrouverEleve from './pages/TrouverEleve.jsx'
import PayerEleve from './pages/PayerEleve.jsx'
import Rattachements from './pages/Rattachements.jsx'
import Documents from './pages/Documents.jsx'
import InfoPublier from './pages/InfoPublier.jsx'
import PresenceEnseignants from './pages/PresenceEnseignants.jsx'
import MonAbsence from './pages/MonAbsence.jsx'
import InfoDetail from './pages/InfoDetail.jsx'
import { Confidentialite, Conditions } from './pages/Legal.jsx'
import Guide from './pages/Guide.jsx'
import Faq from './pages/Faq.jsx'
import AbsencesJour from './pages/AbsencesJour.jsx'
import PageInstallation from './installation.jsx'
import MotDePasseOublie, { VerificationEmail } from './pages/CodeEmail.jsx'
import EleveFiche from './pages/EleveFiche.jsx'
import MesCours from './pages/MesCours.jsx'
import ImportAbsencesEnseignants from './pages/ImportAbsencesEnseignants.jsx'

function Message({ title, children }) {
  return (
    <>
      <h1 className="page-title">{title}</h1>
      <p className="lede">{children}</p>
    </>
  )
}

// Confirmation de l'email depuis l'espace connecte
function VerifierEmailConnecte() {
  const { user, majUser } = useAuth()
  const [envoye, setEnvoye] = useState(false)
  useEffect(() => {
    if (user.emailVerifie || envoye) return
    setEnvoye(true)
    api.post('/api/codes/verification/envoyer', { email: user.email }, { auth: false }).catch(() => {})
  }, [user, envoye])
  if (user.emailVerifie) return <Message title="Email confirmé ✓">Votre adresse {user.email} est confirmée.</Message>
  return (
    <VerificationEmail
      email={user.email}
      onConfirme={async () => {
        majUser({ emailVerifie: true })
        window.location.hash = '/'
      }}
    />
  )
}

// La confirmation de l'adresse e-mail est obligatoire pour tout compte cree a partir du 19 novembre 2026
// (inscription d'un etablissement, d'un parent, d'un eleve ou d'un enseignant). Les comptes plus anciens et
// ceux crees par l'etablissement sans adresse e-mail reelle ne sont pas concernes.
const DEBUT_CONFIRMATION = '2026-11-19T17:30:00Z'
const confirmationRequise = (u) =>
  u && !u.emailVerifie && u.createdAt && new Date(u.createdAt) >= new Date(DEBUT_CONFIRMATION) && /@/.test(u.email || '') && !u.emailTechnique

// Ecran bloquant : code a 6 chiffres recu par e-mail, sans lequel l'espace reste ferme
function ConfirmationObligatoire() {
  const { user, majUser, logout } = useAuth()
  const [envoye, setEnvoye] = useState(false)
  useEffect(() => {
    if (envoye) return
    setEnvoye(true)
    api.post('/api/codes/verification/envoyer', { email: user.email }, { auth: false }).catch(() => {})
  }, [user, envoye])
  return (
    <PageAuth onRetour={logout}>
      <div className="card">
        <VerificationEmail
          email={user.email}
          onConfirme={async () => {
            majUser({ emailVerifie: true })
            window.location.hash = '/'
          }}
        />
      </div>
      <p className="ea-pied">
        <button type="button" className="ea-lien" onClick={logout}>
          Se déconnecter
        </button>
      </p>
    </PageAuth>
  )
}

function Pages({ path }) {
  const { user } = useAuth()
  const gestion = user.role === 'admin' || user.role === 'principal'
  const reserve = (ok, page) =>
    ok ? page : <Message title="Accès réservé">Cette page est réservée à l’administration.</Message>

  // Enseignant pas encore rattache a un etablissement : il le rejoint d'abord (son profil reste accessible)
  if (user.role === 'teacher' && !user.schoolId && path !== '/compte') return <RejoindreEtablissement />
  if (path === '/mes-etablissements') return reserve(user.role === 'teacher', <RejoindreEtablissement />)
  if (path === '/') return <Home />
  if (path === '/compte') return <Account />
  if (path === '/verifier-email') return <VerifierEmailConnecte />
  if (path === '/notifications') return <Notifications />
  // Le fil se remplit avec les documents televerses : etablissement et enseignants passent par Documents
  if (path === '/actualites') return ['principal', 'teacher'].includes(user.role) ? <Documents /> : <Actualites />
  if (path === '/notes') return reserve(['parent', 'student'].includes(user.role), <MesNotes />)
  if (path === '/mes-classes') return reserve(user.role === 'teacher', <MesAffectations />)
  const suiviMatch = path.match(/^\/suivi\/(\d+)$/)
  if (suiviMatch) return reserve(['parent', 'student'].includes(user.role), <Suivi key={suiviMatch[1]} id={Number(suiviMatch[1])} />)
  if (path.split('?')[0] === '/scolarite') return reserve(user.role !== 'teacher', <Scolarite key={path} />)
  if (path === '/encaisser') return reserve(user.role === 'principal', <Guichet />)
  if (path === '/import-eleves') return reserve(gestion, <ImportEleves />)
  if (path === '/import-enseignants') return reserve(user.role === 'principal', <ImportEnseignants />)
  if (path === '/import-emplois') return reserve(user.role === 'principal', <ImportEmplois />)
  if (path === '/emplois') return reserve(user.role === 'principal', <EmploisDuTemps />)
  if (path === '/import-absences') return reserve(user.role === 'principal', <ImportAbsences />)
  if (path === '/administrateurs') return reserve(user.role === 'principal', <Administrateurs />)
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

  const eleveMatch = path.match(/^\/eleves\/(\d+)$/)
  if (eleveMatch) return reserve(gestion, <EleveFiche key={eleveMatch[1]} id={Number(eleveMatch[1])} />)
  if (path === '/emploi') return reserve(user.role === 'teacher', <MonEmploi />)
  if (path === '/abonnement') return reserve(user.role === 'principal', <Abonnement />)
  if (path === '/abonnements') return reserve(user.role === 'admin', <AbonnementsAdmin />)
  if (path === '/quotas-ia') return reserve(user.role === 'admin', <QuotasIA />)
  if (path === '/confidentialite') return <Confidentialite />
  if (path === '/conditions') return <Conditions />
  if (path === '/guide') return <Guide />
  if (path === '/faq') return <Faq />
  if (path === '/installer') return <PageInstallation />
  if (path === '/dossier') return reserve(user.role === 'principal', <ImportDossier />)
  if (path === '/absences') return reserve(['principal', 'admin'].includes(user.role), <AbsencesJour />)
  const infoMatch = path.match(/^\/infos\/(\d+)$/)
  if (infoMatch) return <InfoDetail key={infoMatch[1]} id={Number(infoMatch[1])} />
  if (path === '/info') return reserve(['principal', 'teacher'].includes(user.role), <InfoPublier />)
  if (path === '/presence-enseignants') return reserve(user.role === 'principal', <PresenceEnseignants />)
  if (path === '/mon-absence') return reserve(user.role === 'teacher', <MonAbsence />)
  if (path === '/mes-cours') return reserve(user.role === 'teacher', <MesCours />)
  if (path === '/import-absences-enseignants') return reserve(user.role === 'principal', <ImportAbsencesEnseignants />)
  if (path === '/document' || path === '/publier') return reserve(['principal', 'teacher'].includes(user.role), <Documents />)
  if (path === '/trouver-eleve') return reserve(user.role === 'parent', <TrouverEleve />)
  if (path === '/rattachements') return reserve(user.role === 'principal', <Rattachements />)
  const payerMatch = path.match(/^\/payer\/(\d+)$/)
  if (payerMatch) return reserve(user.role === 'parent', <PayerEleve key={payerMatch[1]} id={Number(payerMatch[1])} />)
  const ordreMatch = path.match(/^\/ordres\/(\d+)$/)
  if (ordreMatch) return <OrdrePaiement key={ordreMatch[1]} id={Number(ordreMatch[1])} />
  if (path === '/litiges')
    return reserve(
      user.role === 'admin',
      <>
        <h1 className="page-title">Litiges de paiement</h1>
        <p className="lede">Paiements contestés entre un parent et un établissement : examinez la capture et la discussion, puis tranchez.</p>
        <ListeOrdres statut="litige" vide="Aucun litige en cours. 👍" />
      </>,
    )
  const releveMatch = path.match(/^\/releve\/(\d+)$/)
  if (releveMatch) return reserve(user.role !== 'teacher', <ReleveScolarite key={releveMatch[1]} id={Number(releveMatch[1])} />)
  const recuScolMatch = path.match(/^\/recus\/(\d+)$/)
  if (recuScolMatch) return <RecuScolarite key={recuScolMatch[1]} id={Number(recuScolMatch[1])} />
  const recuMatch = path.match(/^\/abonnement\/recus\/(\d+)$/)
  if (recuMatch) return reserve(['principal', 'admin'].includes(user.role), <Recu key={recuMatch[1]} id={Number(recuMatch[1])} />)
  if (path === '/discipline') return reserve(gestion || user.role === 'teacher', <DisciplineImport />)
  const emploiMatch = path.match(/^\/classes\/(\d+)\/emploi$/)
  if (emploiMatch) return reserve(gestion || user.role === 'teacher', <EmploiDuTemps key={emploiMatch[1]} id={Number(emploiMatch[1])} />)
  const annuelMatch = path.match(/^\/classes\/(\d+)\/annuel$/)
  if (annuelMatch) return reserve(gestion || user.role === 'teacher', <ConseilAnnuel key={annuelMatch[1]} id={Number(annuelMatch[1])} />)
  const devoirsMatch = path.match(/^\/classes\/(\d+)\/devoirs$/)
  if (devoirsMatch) return reserve(gestion || user.role === 'teacher', <Devoirs key={devoirsMatch[1]} id={Number(devoirsMatch[1])} />)
  // Bulletins : mis de cote pour l'instant (pages/Bulletins.jsx gardee pour plus tard)
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

  // verification d'un recu (QR code) : accessible avec ou sans compte
  const verif = path.match(/^\/verifier(?:\/(.+))?$/)
  if (verif) {
    const code = new URLSearchParams(window.location.hash.split('?')[1] || '').get('c') || ''
    // reservee a l'administration : connexion d'abord, puis retour sur la verification
    if (!user) {
      try {
        sessionStorage.setItem('sukul-apres-connexion', window.location.hash.slice(1))
      } catch {
        /* stockage indisponible */
      }
      return <Login />
    }
    const page = ['principal', 'admin'].includes(user.role) ? (
      <VerifierRecu key={window.location.hash} numero={decodeURIComponent(verif[1] || '')} code={code} />
    ) : (
      <Message title="Réservé à l’établissement">La vérification des reçus est faite par l’administration de l’établissement.</Message>
    )
    return <Shell path={path}>{page}</Shell>
  }
  if (!user) {
    if (path === '/connexion') return <Login />
    if (path === '/inscription') return <Signup />
    if (path === '/inscrire-etablissement') return <SchoolSignup />
    if (path === '/mot-de-passe-oublie') return <MotDePasseOublie />
    if (path === '/confidentialite') return <Confidentialite />
    if (path === '/conditions') return <Conditions />
    if (path === '/installer') return <PageInstallation />
    if (path === '/faq') return <Faq />
    return <Landing />
  }
  // Compte cree depuis la confirmation obligatoire : l'adresse e-mail doit etre confirmee avant d'entrer
  if (confirmationRequise(user)) return <ConfirmationObligatoire />
  return (
    <>
      <Shell path={path}>
        {/* un filet par page : changer de page efface l'erreur */}
        <Secours key={path}>
          <Pages path={path} />
        </Secours>
      </Shell>
      <Didacticiel />
    </>
  )
}

export default function App() {
  return (
    <Secours>
      <AuthProvider>
        <Root />
      </AuthProvider>
      <PremierTheme />
      <Annonces />
    </Secours>
  )
}
