import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'

const ROLES = {
  admin: 'Administrateur de la plateforme',
  principal: 'Administrateur de l’établissement',
  teacher: 'Enseignant',
  parent: 'Parent',
  student: 'Élève',
}

function Tuile({ href, ico, titre, texte, compteur }) {
  const contenu = (
    <>
      <span className="ico">{ico}</span>
      <b>
        {titre} {compteur > 0 && <span className="count">{compteur}</span>}
      </b>
      <small>{texte}</small>
    </>
  )
  return href ? (
    <a className="tile" href={href}>
      {contenu}
    </a>
  ) : (
    <div className="tile" style={{ opacity: 0.6 }}>
      {contenu}
    </div>
  )
}

function Bientot() {
  return <small className="tag tag-wait">Bientôt</small>
}

function EspaceAdmin() {
  const ecoles = useApi('/api/schools')
  return (
    <>
      <h2 className="section-title">Gestion de la plateforme</h2>
      <div className="grid2">
        <Tuile href="#/etablissements" ico="🏫" titre="Établissements" texte={`${ecoles.data?.length ?? '…'} établissement(s)`} />
        <Tuile href="#/utilisateurs" ico="👥" titre="Utilisateurs" texte="Tous les comptes" />
      </div>
    </>
  )
}

function EspaceEtablissement() {
  const attente = useApi('/api/inscriptions/enseignants?status=pending')
  return (
    <>
      <h2 className="section-title">Gestion de l’établissement</h2>
      <div className="grid2">
        <Tuile href="#/enseignants" ico="✅" titre="Enseignants" texte="Comptes à valider" compteur={attente.data?.length || 0} />
        <Tuile href="#/classes" ico="📚" titre="Classes" texte="Classes et élèves" />
        <Tuile href="#/annees" ico="📅" titre="Années" texte="Années scolaires" />
        <Tuile href="#/utilisateurs" ico="👥" titre="Utilisateurs" texte="Comptes de l’établissement" />
      </div>
    </>
  )
}

function EspaceParent() {
  const enfants = useApi('/api/inscriptions/mes-enfants')
  return (
    <>
      <h2 className="section-title">Mes enfants</h2>
      {enfants.loading && <p className="muted">Chargement…</p>}
      {enfants.data?.length === 0 && <p className="muted">Aucun enfant déclaré.</p>}
      {enfants.data?.length > 0 && (
        <ul className="rows">
          {enfants.data.map((e) => (
            <li className="row" key={e.id}>
              <span style={{ fontSize: 26 }}>🧒</span>
              <div className="row-main">
                <div className="row-title">
                  {e.child_first_name} {e.child_last_name}
                </div>
                <div className="row-sub">{e.child_class || 'Classe non précisée'}</div>
              </div>
              {e.status === 'approved' ? (
                <span className="tag tag-now">Relié</span>
              ) : (
                <span className="tag tag-wait">En attente</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="muted" style={{ fontSize: 14, marginTop: 10 }}>
        Un enfant est relié automatiquement dès qu’il apparaît dans l’établissement avec les mêmes prénom et nom.
      </p>
      <h2 className="section-title">Suivi</h2>
      <div className="grid2">
        <Tuile ico="📝" titre="Notes" texte={<Bientot />} />
        <Tuile ico="🗓️" titre="Présences" texte={<Bientot />} />
        <Tuile ico="💳" titre="Scolarité" texte={<Bientot />} />
        <Tuile ico="📣" titre="Annonces" texte={<Bientot />} />
      </div>
    </>
  )
}

function EspaceEleve() {
  return (
    <>
      <h2 className="section-title">Mon espace</h2>
      <div className="grid2">
        <Tuile ico="📝" titre="Mes notes" texte={<Bientot />} />
        <Tuile ico="⏰" titre="Emploi du temps" texte={<Bientot />} />
        <Tuile ico="🗓️" titre="Présences" texte={<Bientot />} />
        <Tuile ico="📣" titre="Annonces" texte={<Bientot />} />
      </div>
    </>
  )
}

function EspaceEnseignant() {
  return (
    <>
      <h2 className="section-title">Mon espace enseignant</h2>
      <div className="grid2">
        <Tuile ico="📝" titre="Publier des notes" texte={<Bientot />} />
        <Tuile ico="🙋" titre="Faire l’appel" texte={<Bientot />} />
        <Tuile ico="📚" titre="Mes classes" texte={<Bientot />} />
        <Tuile ico="📣" titre="Annonces" texte={<Bientot />} />
      </div>
    </>
  )
}

export default function Home() {
  const { user } = useAuth()
  return (
    <>
      <section className="hero-card" style={{ marginTop: 8 }}>
        <span className="badge">{ROLES[user.role] || user.role}</span>
        <h2 style={{ marginTop: 12 }}>Bonjour, {user.firstName} 👋</h2>
        <p>{user.schoolName || (user.role === 'admin' ? 'Tous les établissements' : '')}</p>
      </section>
      {user.role === 'admin' && <EspaceAdmin />}
      {user.role === 'principal' && <EspaceEtablissement />}
      {user.role === 'parent' && <EspaceParent />}
      {user.role === 'student' && <EspaceEleve />}
      {user.role === 'teacher' && <EspaceEnseignant />}
    </>
  )
}
