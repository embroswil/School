import { useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Publication } from './Actualites.jsx'
import { CarteEleve } from './Suivi.jsx'
import { BandeauAbonnement } from './Abonnement.jsx'
import Fil from './Fil.jsx'
import { IcActus, IcCarte, IcChevron, IcClasses, IcCoche, IcEcole, IcEleves, IcImport, IcMessages, IcPhoto, IcPlus, IcProfil, IcCasquette, IcGraphique } from '../icones.jsx'

const ROLES = {
  admin: 'Administrateur de la plateforme',
  principal: 'Administrateur de l’établissement',
  teacher: 'Enseignant',
  parent: 'Parent',
  student: 'Élève',
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
      <Action href="#/abonnements" Icone={IcCarte} titre="Abonnements des établissements" texte="Tarifs, paiements à confirmer, revenus" />
      <Action href="#/litiges" Icone={IcCoche} titre="Litiges de paiement" texte="Paiements contestés entre parents et établissements" />
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

// Grande tuile de l'accueil (etablissement et enseignant)
function Tuile({ href, Icone, titre, texte, chiffre, alerte }) {
  return (
    <a className={`grande-tuile ${alerte ? 'alerte' : ''}`} href={href}>
      <span className="gt-ico">
        <Icone size={22} />
      </span>
      {chiffre !== undefined && <b className="gt-chiffre">{chiffre}</b>}
      <b className="gt-titre">{titre}</b>
      <span className="gt-texte">{texte}</span>
    </a>
  )
}

const aujourdhuiLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Accueil de l'etablissement : la journee en 3 chiffres, ce qui attend, puis 6 grandes portes d'entree
function EspaceEtablissement() {
  const t = useApi('/api/etablissement/tableau')
  const abs = useApi(`/api/notes/absences?date=${aujourdhuiLocal()}`)
  const prof = useApi(`/api/presence-enseignants?date=${aujourdhuiLocal()}`)
  const ordres = useApi('/api/scolarite/ordres?statut=paye,litige')
  const demandes = useApi('/api/familles/demandes')
  const d = t.data || {}
  const sansAppel = prof.data ? prof.data.cours.filter((c) => c.etat === 'sans_appel').length + prof.data.absences.length : null
  const aConfirmer = ordres.data?.length ?? null
  const taches = [
    d.eleves === 0 && ['#/import-eleves', 'Ajoutez vos élèves', 'Importez vos listes de classe (Excel, PDF ou photo)'],
    d.enseignants_attente > 0 && ['#/enseignants', `${d.enseignants_attente} enseignant(s) à valider`, 'Vérifiez et validez leurs comptes'],
    demandes.data?.length > 0 && ['#/rattachements', `${demandes.data.length} parent(s) à valider`, 'Demandes de suivi d’un élève'],
    d.eleves_sans_classe > 0 && ['#/eleves', `${d.eleves_sans_classe} élève(s) sans classe`, 'À placer dans leur classe'],
  ].filter(Boolean)
  return (
    <>
      {t.error && (
        <div className="note note-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span>{t.error}</span>
          <button type="button" className="btn btn-quiet" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => t.reload()}>
            Réessayer
          </button>
        </div>
      )}
      <EnteteEtablissement d={d} onChange={() => t.reload()} />

      <h2 className="section-title">Aujourd’hui</h2>
      <div className="jour-chiffres">
        <a href="#/absences">
          <b className={abs.data?.absents ? 'rouge' : ''}>{abs.data ? abs.data.absents : '…'}</b>
          <span>élève(s) absent(s)</span>
        </a>
        <a href="#/presence-enseignants">
          <b className={sansAppel ? 'rouge' : ''}>{sansAppel ?? '…'}</b>
          <span>cours non assuré(s)</span>
        </a>
        <a href="#/scolarite">
          <b className={aConfirmer ? 'rouge' : ''}>{aConfirmer ?? '…'}</b>
          <span>paiement(s) à confirmer</span>
        </a>
      </div>

      {taches.length > 0 && (
        <>
          <h2 className="section-title">À faire</h2>
          {taches.map(([href, titre, texte]) => (
            <Action key={href} href={href} Icone={IcCoche} titre={titre} texte={texte} urgent />
          ))}
        </>
      )}

      <h2 className="section-title">Mon établissement</h2>
      <div className="grille-tuiles">
        <Tuile href="#/eleves" Icone={IcEleves} titre="Élèves" texte="Listes, classes, fiches" chiffre={d.eleves ?? '…'} />
        <Tuile href="#/presence-enseignants" Icone={IcCasquette} titre="Enseignants" texte="Présence, cours assurés" chiffre={d.enseignants ?? '…'} />
        <Tuile href="#/scolarite" Icone={IcCarte} titre="Scolarité" texte="Frais, paiements, guichet" />
        <Tuile href="#/document" Icone={IcActus} titre="Informer" texte="Documents et informations" />
        <Tuile href="#/messages" Icone={IcMessages} titre="Messages" texte="Parents et enseignants" />
        <Tuile href="#/abonnement" Icone={IcGraphique} titre="Abonnement" texte="School, paiement, reçus" />
      </div>
    </>
  )
}

// Accueil du parent, du tuteur ou du donateur : ses enfants, puis le fil d'informations
function EspaceParent() {
  const enfants = useApi('/api/suivi/eleves')
  return (
    <Fil
      enfants={enfants.data || []}
      actions={
        <>
          <a className="enfant-carte action" href="#/trouver-eleve">
            ＋ Mon enfant
          </a>
          <a className="enfant-carte action" href="#/trouver-eleve">
            Payer une scolarité
          </a>
        </>
      }
    />
  )
}

// Accueil de l'eleve : son suivi, puis le fil d'informations
function EspaceEleve() {
  const moi = useApi('/api/suivi/eleves')
  return <Fil enfants={moi.data || []} />
}

// Cours du moment (ou le prochain de la journee) d'apres l'emploi du temps de l'enseignant
function coursDuMoment(creneaux) {
  const d = new Date()
  const jour = d.getDay()
  const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const auj = creneaux.filter((c) => c.jour === jour).sort((a, b) => a.debut.localeCompare(b.debut))
  return { maintenant: auj.find((c) => c.debut <= t && t < c.fin), suivant: auj.find((c) => c.debut > t), nombre: auj.length }
}

// Accueil de l'enseignant : le cours du moment, 4 actions, ses classes, puis le fil
function EspaceEnseignant() {
  const classes = useApi('/api/notes/mes-classes')
  const edt = useApi('/api/vie-scolaire/emplois/moi')
  const { maintenant, suivant, nombre } = coursDuMoment(edt.data?.creneaux || [])
  const cours = maintenant || suivant
  return (
    <>
      <section className="cours-moment">
        {cours ? (
          <>
            <span className="badge">{maintenant ? 'En ce moment' : 'Prochain cours'}</span>
            <h2>
              {cours.classe} · {cours.matiere}
            </h2>
            <p>
              {cours.debut} – {cours.fin}
              {cours.salle ? ` · salle ${cours.salle}` : ''}
            </p>
            <a className="btn btn-block" href={`#/classes/${cours.class_id}/appel`}>
              Faire l’appel
            </a>
          </>
        ) : (
          <>
            <span className="badge">Aujourd’hui</span>
            <h2>{nombre ? 'Vos cours du jour sont terminés' : 'Pas de cours aujourd’hui'}</h2>
            <p>{edt.data?.creneaux?.length ? 'Bonne fin de journée !' : 'Votre emploi du temps apparaîtra ici dès que l’établissement l’aura saisi.'}</p>
          </>
        )}
      </section>

      <div className="grille-tuiles quatre">
        <Tuile href="#/info" Icone={IcActus} titre="Informer" texte="Info, cours supplémentaire, photos" />
        <Tuile href="#/document" Icone={IcImport} titre="Document" texte="PDF ou photo" />
        <Tuile href="#/emploi" Icone={IcClasses} titre="Emploi du temps" texte="Mes cours" />
        <Tuile href="#/mon-absence" Icone={IcCoche} titre="Mon absence" texte="Prévenir l’établissement" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 className="section-title">Mes classes</h2>
        <a href="#/mes-classes" style={{ fontWeight: 700, fontSize: 14 }}>
          Modifier
        </a>
      </div>
      {classes.data?.length === 0 && <Action href="#/mes-classes" Icone={IcClasses} titre="Choisir mes classes" texte="Indiquez vos matières et vos classes" />}
      {classes.data?.length > 0 && (
        <ul className="liste-eleves">
          {classes.data.map((c) => (
            <li key={c.id} style={{ padding: '10px 12px', gap: 6, flexWrap: 'wrap' }}>
              <span className="nom" style={{ flex: '1 1 140px', minWidth: 0 }}>
                <b>
                  {c.name}
                  {c.prof_principal ? ' · PP' : ''}
                </b>
                <small>
                  {c.matieres.join(', ') || '—'} · {c.eleves} élèves
                </small>
              </span>
              <a className="btn btn-quiet" style={{ padding: '7px 10px', fontSize: 13 }} href={`#/classes/${c.id}/notes`}>
                Notes
              </a>
              <a className="btn btn-quiet" style={{ padding: '7px 10px', fontSize: 13 }} href={`#/classes/${c.id}/devoirs`}>
                Devoirs
              </a>
              {c.prof_principal && (
                <a className="btn btn-quiet" style={{ padding: '7px 10px', fontSize: 13 }} href={`#/classes/${c.id}/bulletins`}>
                  Bulletins
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
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
        <a className="note" href="#/verifier-email" style={{ display: 'block', background: 'rgba(255, 211, 77, 0.12)', color: 'var(--primary)', marginTop: 4 }}>
          ✉️ Confirmez votre adresse email pour sécuriser votre compte (mot de passe oublié…). <u>Confirmer</u>
        </a>
      )}
      {user.role !== 'admin' && user.schoolId && <BandeauAbonnement role={user.role} />}
      {user.role === 'teacher' && (
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
      {user.role === 'teacher' && (
        <>
          <h2 className="section-title">Informations</h2>
          <Fil />
        </>
      )}
    </>
  )
}
