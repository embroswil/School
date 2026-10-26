import { useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Publication } from './Actualites.jsx'
import { IcActus, IcCarte, IcChevron, IcCoche, IcEcole, IcEleves, IcImport, IcPhoto } from '../icones.jsx'

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
  const st = useApi('/api/schools/statistiques')
  const d = st.data || {}
  const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
  const recente = (x) => (x ? new Date(x).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'jamais')
  return (
    <>
      <div className="stats">
        <a className="stat" href="#/etablissements" style={{ color: 'inherit' }}>
          <b>{d.etablissements ?? '…'}</b>
          <span>écoles</span>
        </a>
        <div className="stat">
          <b>{d.eleves ?? '…'}</b>
          <span>élèves</span>
        </div>
        <div className="stat">
          <b>{d.enseignants ?? '…'}</b>
          <span>enseignants</span>
        </div>
        <div className="stat">
          <b>{d.parents ?? '…'}</b>
          <span>parents</span>
        </div>
      </div>

      <h2 className="section-title">{d.demandes ? 'À traiter' : 'Activité'}</h2>
      {d.demandes > 0 && (
        <Action href="#/etablissements" Icone={IcEcole} titre="Demandes d’établissements" texte="Écoles qui veulent rejoindre School" compteur={d.demandes} urgent />
      )}
      <Action href="#/utilisateurs" Icone={IcEleves} titre="Nouveaux comptes" texte={`${d.inscrits_7j ?? '…'} inscription(s) ces 7 derniers jours`} />
      <Action href="#/etablissements" Icone={IcCarte} titre="Paiements de scolarité" texte={`${fcfa(d.paiements_total)} encaissés par les écoles`} />

      <h2 className="section-title">Établissements</h2>
      {d.ecoles?.length === 0 && <p className="muted">Aucun établissement pour le moment.</p>}
      {d.ecoles?.length > 0 && (
        <ul className="rows">
          {d.ecoles.map((e) => (
            <a className="row" key={e.id} href="#/etablissements">
              <span style={{ fontSize: 24 }}>🏫</span>
              <div className="row-main">
                <div className="row-title">
                  {e.name} {!e.is_active && <span className="tag tag-off">Suspendu</span>}
                </div>
                <div className="row-sub">
                  {e.eleves} élèves · {e.enseignants} enseignants · {e.parents} parents · actif {recente(e.derniere_activite)}
                </div>
              </div>
            </a>
          ))}
        </ul>
      )}
    </>
  )
}

function Action({ href, Icone, titre, texte, compteur, urgent }) {
  return (
    <a className={`action-row ${urgent && compteur ? 'urgent' : ''}`} href={href}>
      <span className="ico">
        <Icone />
      </span>
      <span>
        <b>{titre}</b>
        <small>{texte}</small>
      </span>
      <span className="fin">
        {compteur > 0 && <span className="count">{compteur}</span>}
        <IcChevron size={18} />
      </span>
    </a>
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

function EnteteEtablissement({ d, onChange }) {
  const champ = useRef(null)
  const [busy, setBusy] = useState(false)
  async function choisir(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy(true)
    try {
      await api.put('/api/etablissement/photo', { photo: await reduirePhoto(f) })
      onChange()
    } catch {
      // l'erreur s'affiche au prochain essai
    }
    setBusy(false)
  }
  return (
    <section
      className="hero-card"
      style={{
        marginTop: 4,
        minHeight: 150,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        backgroundImage: d.photo ? `linear-gradient(180deg, rgba(15,26,60,0.05) 25%, rgba(15,26,60,0.88)), url(${d.photo})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
      }}
    >
      <button
        type="button"
        className="icon-btn"
        aria-label={d.photo ? 'Changer la photo' : 'Ajouter une photo'}
        style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.9)', border: 0 }}
        onClick={() => champ.current?.click()}
        disabled={busy}
      >
        <IcPhoto />
      </button>
      <input ref={champ} type="file" accept="image/*" hidden onChange={choisir} />
      <span className="badge" style={{ alignSelf: 'flex-start' }}>
        {d.annee?.name ? `Année ${d.annee.name}` : 'Établissement'}
      </span>
      <h2 style={{ marginTop: 8 }}>{d.nom || 'Mon établissement'}</h2>
    </section>
  )
}

function EspaceEtablissement() {
  const t = useApi('/api/etablissement/tableau')
  const confirmer = useApi('/api/scolarite/a-confirmer')
  const d = t.data || {}
  const nbConfirmer = confirmer.data?.length || 0
  const urgences = (d.enseignants_attente || 0) + nbConfirmer
  return (
    <>
      <EnteteEtablissement d={d} onChange={() => t.reload()} />
      <div className="stats">
        <a className="stat" href="#/eleves" style={{ color: 'inherit' }}>
          <b>{d.eleves ?? '…'}</b>
          <span>élèves</span>
        </a>
        <a className="stat" href="#/enseignants" style={{ color: 'inherit' }}>
          <b>{d.enseignants ?? '…'}</b>
          <span>enseignants</span>
        </a>
        <div className="stat">
          <b>{d.parents ?? '…'}</b>
          <span>parents</span>
        </div>
        <a className="stat" href="#/classes" style={{ color: 'inherit' }}>
          <b>{d.classes ?? '…'}</b>
          <span>classes</span>
        </a>
      </div>

      <h2 className="section-title">{urgences ? 'À traiter' : 'Tout est à jour ✓'}</h2>
      {d.enseignants_attente > 0 && (
        <Action href="#/enseignants" Icone={IcCoche} titre="Enseignants à valider" texte="Vérifiez leurs informations" compteur={d.enseignants_attente} urgent />
      )}
      {nbConfirmer > 0 && (
        <Action href="#/scolarite" Icone={IcCarte} titre="Paiements à confirmer" texte="Transferts déclarés par les parents" compteur={nbConfirmer} urgent />
      )}
      {d.eleves_sans_classe > 0 && (
        <Action href="#/eleves" Icone={IcEleves} titre="Élèves sans classe" texte="À placer dans leur classe" compteur={d.eleves_sans_classe} urgent />
      )}

      <h2 className="section-title">Gérer l’établissement</h2>
      {d.eleves === 0 ? (
        <Action href="#/import-eleves" Icone={IcImport} titre="Ajouter vos élèves" texte="Photographiez ou envoyez vos listes de classe" />
      ) : (
        <Action href="#/eleves" Icone={IcEleves} titre="Élèves et classes" texte={`${d.eleves} élèves · ${d.classes} classes`} />
      )}
      <Action href="#/actualites" Icone={IcActus} titre="Actualités" texte="Annonces, événements, conseils de discipline" />
      <Action href="#/scolarite" Icone={IcCarte} titre="Scolarité" texte="Frais, paiements et moyens de paiement" />
      <Action href="#/enseignants" Icone={IcEcole} titre="Enseignants" texte="Équipe pédagogique" />
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
      {!['principal', 'admin'].includes(user.role) && (
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
