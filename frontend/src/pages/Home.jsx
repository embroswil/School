import { useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Publication } from './Actualites.jsx'
import { CarteEleve } from './Suivi.jsx'
import { IcActus, IcCarte, IcChevron, IcClasses, IcCoche, IcEcole, IcEleves, IcImport, IcPhoto, IcPlus, IcProfil } from '../icones.jsx'

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

const TYPES_ECOLE = { maternelle: 'Maternelle', primaire: 'Primaire', college: 'Collège', lycee: 'Lycée' }
const nombre = (n) => (n === undefined || n === null ? '…' : Number(n).toLocaleString('fr-FR'))

function Kpi({ Icone, valeur, libelle, detail }) {
  return (
    <div className="kpi">
      <span className="kpi-ico">
        <Icone size={18} />
      </span>
      <b>{valeur}</b>
      <span>{libelle}</span>
      {detail && <small>{detail}</small>}
    </div>
  )
}

// Tableau de bord de l'administrateur de la plateforme
function EspaceAdmin() {
  const { user } = useAuth()
  const st = useApi('/api/schools/statistiques')
  const d = st.data || {}
  const recente = (x) => {
    if (!x) return 'aucune connexion'
    const jours = Math.floor((Date.now() - new Date(x).getTime()) / 86400000)
    if (jours <= 0) return 'actif aujourd’hui'
    if (jours === 1) return 'actif hier'
    return `actif il y a ${jours} j`
  }
  const aujourdhui = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <>
      <section className="hero-card" style={{ marginTop: 4 }}>
        <span className="badge">Plateforme School</span>
        <h2 style={{ marginTop: 10 }}>Bonjour, {user.firstName}</h2>
        <p style={{ textTransform: 'capitalize' }}>{aujourdhui}</p>
        <div className="hero-ligne">
          <span>
            <b>{nombre(d.etablissements_actifs)}</b> établissement(s) actif(s)
          </span>
          <span>
            <b>{nombre(d.inscrits_7j)}</b> inscription(s) cette semaine
          </span>
        </div>
      </section>

      <h2 className="section-title">À traiter</h2>
      {d.demandes > 0 ? (
        <Action
          href="#/etablissements"
          Icone={IcEcole}
          titre="Demandes d’établissements"
          texte="Écoles en attente d’activation"
          compteur={d.demandes}
          urgent
        />
      ) : (
        <div className="action-row" style={{ boxShadow: 'none' }}>
          <span className="ico" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>
            <IcCoche />
          </span>
          <span>
            <b>Tout est à jour</b>
            <small>Aucune demande d’établissement en attente</small>
          </span>
        </div>
      )}

      <h2 className="section-title">Indicateurs</h2>
      <div className="kpis">
        <Kpi Icone={IcEcole} valeur={nombre(d.etablissements)} libelle="Établissements" detail={`${nombre(d.etablissements_actifs)} actifs`} />
        <Kpi Icone={IcEleves} valeur={nombre(d.eleves)} libelle="Élèves" detail={`${nombre(d.eleves_avec_compte)} avec un compte`} />
        <Kpi Icone={IcClasses} valeur={nombre(d.enseignants)} libelle="Enseignants" detail="comptes validés" />
        <Kpi Icone={IcProfil} valeur={nombre(d.parents)} libelle="Parents" detail="inscrits" />
        <Kpi Icone={IcActus} valeur={nombre(d.inscrits_7j)} libelle="Nouveaux comptes" detail="7 derniers jours" />
        <Kpi Icone={IcCarte} valeur={`${nombre(d.paiements_total)}`} libelle="FCFA encaissés" detail="par les écoles" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 className="section-title">Établissements</h2>
        <a href="#/etablissements" style={{ fontWeight: 700, fontSize: 14 }}>
          Gérer
        </a>
      </div>
      {d.ecoles?.length === 0 && <p className="muted">Aucun établissement pour le moment.</p>}
      {d.ecoles?.map((e) => (
        <a className="ecole-carte" key={e.id} href={`#/etablissements/${e.id}`}>
          <div className="ecole-tete">
            <span className="pastille-ico" style={{ width: 42, height: 42 }}>
              <IcEcole size={20} />
            </span>
            <div className="row-main">
              <div className="row-title">{e.name}</div>
              <div className="row-sub">
                {TYPES_ECOLE[e.type] || ''}
                {e.city ? ` · ${e.city}` : ''} · {recente(e.derniere_activite)}
              </div>
            </div>
            {e.is_active ? <span className="tag tag-now">Actif</span> : <span className="tag tag-off">Suspendu</span>}
          </div>
          <div className="ecole-chiffres">
            <span>
              <b>{nombre(e.eleves)}</b> élèves
            </span>
            <span>
              <b>{nombre(e.enseignants)}</b> enseignants
            </span>
            <span>
              <b>{nombre(e.parents)}</b> parents
            </span>
          </div>
        </a>
      ))}

      <h2 className="section-title">Raccourcis</h2>
      <Action href="#/etablissements" Icone={IcPlus} titre="Ajouter un établissement" texte="Créer une école et désigner son administrateur" />
      <Action href="#/utilisateurs" Icone={IcEleves} titre="Comptes utilisateurs" texte="Rechercher, activer ou désactiver un compte" />
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
  const enfants = useApi('/api/suivi/eleves')
  const declares = useApi('/api/inscriptions/mes-enfants')
  const enAttente = (declares.data || []).filter((e) => e.status !== 'approved')
  return (
    <>
      <h2 className="section-title">Mes enfants</h2>
      {enfants.loading && !enfants.data && <p className="muted">Chargement…</p>}
      {enfants.data?.map((e) => <CarteEleve key={e.id} e={e} />)}
      {enAttente.map((e) => (
        <div className="ecole-carte" key={`a${e.id}`} style={{ opacity: 0.75 }}>
          <div className="ecole-tete">
            <span className="avatar" style={{ width: 44, height: 44, borderRadius: 14, fontSize: 16, background: 'var(--line)', color: 'var(--muted)' }}>
              ?
            </span>
            <div className="row-main">
              <div className="row-title">
                {e.child_first_name} {e.child_last_name}
              </div>
              <div className="row-sub">{e.child_class || 'Classe non précisée'} · en attente</div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            Pas encore retrouvé dans l’établissement. Il sera relié automatiquement dès qu’il y sera inscrit sous les mêmes prénom et nom.
          </p>
        </div>
      ))}
      {enfants.data?.length === 0 && enAttente.length === 0 && <p className="muted">Aucun enfant déclaré.</p>}
      <h2 className="section-title">Raccourcis</h2>
      <Action href="#/scolarite" Icone={IcCarte} titre="Scolarité" texte="Frais payés, reste à payer, paiement" />
      <Action href="#/messages" Icone={IcActus} titre="Écrire à l’établissement" texte="Une question, une absence à justifier…" />
    </>
  )
}

function EspaceEleve() {
  const moi = useApi('/api/suivi/eleves')
  return (
    <>
      <h2 className="section-title">Mon suivi</h2>
      {moi.data?.map((e) => <CarteEleve key={e.id} e={e} />)}
      <Action href="#/scolarite" Icone={IcCarte} titre="Ma scolarité" texte="Frais payés et reste à payer" />
    </>
  )
}

function EspaceEnseignant() {
  const classes = useApi('/api/notes/mes-classes')
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 className="section-title">Mes classes</h2>
        <a href="#/mes-classes" style={{ fontWeight: 700, fontSize: 14 }}>
          Modifier
        </a>
      </div>
      {classes.loading && !classes.data && <p className="muted">Chargement…</p>}
      {classes.data?.length === 0 && (
        <Action href="#/mes-classes" Icone={IcClasses} titre="Choisir mes classes" texte="Indiquez vos matières et vos classes" />
      )}
      {classes.data?.map((c) => (
        <div className="ecole-carte" key={c.id}>
          <div className="ecole-tete">
            <span className="pastille-ico" style={{ width: 44, height: 44 }}>
              <IcClasses size={20} />
            </span>
            <div className="row-main">
              <div className="row-title">
                {c.name} {c.prof_principal && <span className="tag">Prof. principal</span>}
              </div>
              <div className="row-sub">
                {c.matieres.length ? c.matieres.join(', ') : 'Aucune matière'} · {c.eleves} élèves
              </div>
            </div>
          </div>
          <div className="actions" style={{ marginTop: 12 }}>
            {c.matieres.length > 0 && (
              <a className={`btn ${c.appel_fait ? 'btn-quiet' : ''}`} style={{ padding: '10px 14px', fontSize: 14 }} href={`#/classes/${c.id}/appel`}>
                {c.appel_fait ? '✓ Appel fait' : 'Faire l’appel'}
              </a>
            )}
            <a className="btn btn-quiet" style={{ padding: '10px 14px', fontSize: 14 }} href={`#/classes/${c.id}/notes`}>
              Notes
            </a>
            {c.prof_principal && (
              <a className="btn btn-quiet" style={{ padding: '10px 14px', fontSize: 14 }} href={`#/classes/${c.id}/notes?onglet=resultats`}>
                Résultats
              </a>
            )}
          </div>
        </div>
      ))}
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
      {user.emailVerifie === false && (
        <a className="note" href="#/verifier-email" style={{ display: 'block', background: '#fff4dc', color: '#7a5200', marginTop: 4 }}>
          ✉️ Confirmez votre adresse email pour sécuriser votre compte (mot de passe oublié…). <u>Confirmer</u>
        </a>
      )}
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
