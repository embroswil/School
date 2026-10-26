import { useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Publication } from './Actualites.jsx'

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
  const demandes = useApi('/api/demandes-etablissements?status=pending')
  return (
    <>
      <h2 className="section-title">Gestion de la plateforme</h2>
      <div className="grid2">
        <Tuile
          href="#/etablissements"
          ico="🏫"
          titre="Établissements"
          texte={`${ecoles.data?.length ?? '…'} établissement(s)`}
          compteur={demandes.data?.length || 0}
        />
        <Tuile href="#/utilisateurs" ico="👥" titre="Utilisateurs" texte="Tous les comptes" />
      </div>
    </>
  )
}

function Chiffre({ valeur, libelle }) {
  return (
    <div className="tile" style={{ gap: 2 }}>
      <span className="figure">{valeur ?? '…'}</span>
      <small>{libelle}</small>
    </div>
  )
}

// Reduit une photo a 800 px de large (JPEG) avant l'envoi
const reduirePhoto = (fichier) =>
  new Promise((ok, ko) => {
    const img = new Image()
    img.onload = () => {
      const echelle = Math.min(1, 800 / img.width)
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * echelle)
      c.height = Math.round(img.height * echelle)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      ok(c.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => ko(new Error('Image illisible'))
    img.src = URL.createObjectURL(fichier)
  })

function PhotoEtablissement({ photo, nom, onChange }) {
  const champ = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function choisir(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy(true)
    setError('')
    try {
      await api.put('/api/etablissement/photo', { photo: await reduirePhoto(f) })
      onChange()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  return (
    <section
      className="hero-card"
      style={{
        marginTop: 8,
        minHeight: 170,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        backgroundImage: photo
          ? `linear-gradient(180deg, rgba(15,26,60,0.05) 30%, rgba(15,26,60,0.85)), url(${photo})`
          : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <span className="badge" style={{ alignSelf: 'flex-start' }}>Administrateur de l’établissement</span>
      <h2 style={{ marginTop: 10 }}>{nom || 'Mon établissement'}</h2>
      <div className="actions" style={{ marginTop: 10 }}>
        <button type="button" className="badge" style={{ border: 0, cursor: 'pointer', padding: '8px 12px' }} onClick={() => champ.current?.click()} disabled={busy}>
          📷 {busy ? 'Envoi…' : photo ? 'Changer la photo' : 'Ajouter une photo'}
        </button>
      </div>
      {error && <p style={{ marginTop: 6, fontWeight: 700 }}>{error}</p>}
      <input ref={champ} type="file" accept="image/*" hidden onChange={choisir} />
    </section>
  )
}

function EspaceEtablissement() {
  const t = useApi('/api/etablissement/tableau')
  const d = t.data || {}
  return (
    <>
      <PhotoEtablissement photo={d.photo} nom={d.nom} onChange={() => t.reload()} />
      {d.classes === 0 && (
        <div className="note note-ok" style={{ marginTop: 16 }}>
          Votre année scolaire {d.annee?.name} est prête. Première étape : créez vos <a href="#/classes">classes</a>.
        </div>
      )}
      <h2 className="section-title">En un coup d’œil{d.annee ? ` · ${d.annee.name}` : ''}</h2>
      <div className="grid2">
        <Chiffre valeur={d.eleves} libelle="élèves inscrits" />
        <Chiffre valeur={d.enseignants} libelle="enseignants" />
        <Chiffre valeur={d.parents} libelle="parents" />
        <Chiffre valeur={d.classes} libelle="classes" />
      </div>
      <h2 className="section-title">À faire</h2>
      <div className="grid2">
        <Tuile href="#/enseignants" ico="✅" titre="Enseignants" texte="Comptes à valider" compteur={d.enseignants_attente || 0} />
        <Tuile href="#/eleves" ico="🎒" titre="Élèves" texte="À placer dans une classe" compteur={d.eleves_sans_classe || 0} />
        <Tuile href="#/classes" ico="📚" titre="Classes" texte="Créer et gérer les classes" />
        <Tuile href="#/scolarite" ico="💳" titre="Scolarité" texte="Frais et paiements" />
        <Tuile href="#/actualites" ico="📣" titre="Actualités" texte="Annonces, événements, discipline" />
        <Tuile href="#/messages" ico="✉️" titre="Messages" texte="Parents, élèves, enseignants" />
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
        <Tuile href="#/scolarite" ico="💳" titre="Scolarité" texte="Payé, reste à payer" />
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
      </div>
    </>
  )
}

function DernieresActualites() {
  const fil = useApi('/api/actualites?limite=5')
  if (!fil.data?.length) return null
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 className="section-title">Actualités</h2>
        <a href="#/actualites" style={{ fontWeight: 700, fontSize: 14 }}>
          Tout voir
        </a>
      </div>
      {fil.data.map((p) => (
        <Publication key={p.id} p={p} />
      ))}
    </>
  )
}

export default function Home() {
  const { user } = useAuth()
  return (
    <>
      {user.role !== 'principal' && (
      <section className="hero-card" style={{ marginTop: 8 }}>
        <span className="badge">{ROLES[user.role] || user.role}</span>
        <h2 style={{ marginTop: 12 }}>Bonjour, {user.firstName} 👋</h2>
        <p>{user.schoolName || (user.role === 'admin' ? 'Tous les établissements' : '')}</p>
      </section>
      )}
      {user.role === 'admin' && <EspaceAdmin />}
      {user.role === 'principal' && <EspaceEtablissement />}
      {user.role === 'parent' && <EspaceParent />}
      {user.role === 'student' && <EspaceEleve />}
      {user.role === 'teacher' && <EspaceEnseignant />}
      {['parent', 'student', 'teacher'].includes(user.role) && <DernieresActualites />}
    </>
  )
}
