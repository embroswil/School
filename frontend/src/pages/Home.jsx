import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Publication } from './Actualites.jsx'
import { CarteEleve } from './Suivi.jsx'
import { BandeauAbonnement } from './Abonnement.jsx'
import Fil from './Fil.jsx'
import { ChoixEspace } from '../espace.jsx'
import Recadreur from '../Recadreur.jsx'
import { IcSac, IcMessages as IcMessagesHome, IcFamille, IcCalendrier, IcScan, IcActus, IcCarte, IcCasquette, IcChevron, IcClasses, IcCoche, IcDocument, IcEcole, IcEleves, IcFichier, IcImport, IcMegaphone, IcPhoto, IcPlus, IcProf, IcProfil } from '../icones.jsx'
import { confirmable, confirmerCours } from './MesCours.jsx'

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
        <span className="badge">Plateforme Sùkûl</span>
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
        <Kpi Icone={IcCarte} valeur={`${nombre(d.paiements_total)}`} libelle="FCFA payés en ligne" detail="via Sùkûl, à reverser aux écoles" />
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

// Photo et nom de l'etablissement gardes sur l'appareil : a l'ouverture de l'application,
// l'en-tete s'affiche tout de suite, sans attendre la reponse du serveur.
const CLE_ENTETE = 'sukul-entete'
const lireEntete = () => {
  try {
    return JSON.parse(localStorage.getItem(CLE_ENTETE) || 'null')
  } catch (_) {
    return null
  }
}

function EnteteEtablissement({ d, ecole, onChange }) {
  const champ = useRef(null)
  const [busy, setBusy] = useState(false)
  const [aRecadrer, setARecadrer] = useState(null)
  const [garde] = useState(lireEntete)
  const charge = d.nom !== undefined
  const memo = !charge && garde && garde.ecole === ecole ? garde : null
  const photo = charge ? d.photo : memo?.photo
  const nom = charge ? d.nom : memo?.nom
  useEffect(() => {
    if (!charge) return
    try {
      localStorage.setItem(CLE_ENTETE, JSON.stringify({ ecole, nom: d.nom || '', photo: d.photo || null }))
    } catch (_) {
      // photo trop lourde pour le stockage : on garde au moins le nom
      try {
        localStorage.setItem(CLE_ENTETE, JSON.stringify({ ecole, nom: d.nom || '', photo: null }))
      } catch (__) {
        /* stockage indisponible */
      }
    }
  }, [charge, ecole, d.nom, d.photo])
  function choisir(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) setARecadrer(f)
  }
  async function envoyerPhoto(photo) {
    setARecadrer(null)
    setBusy(true)
    try {
      await api.put('/api/etablissement/photo', { photo })
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
        backgroundImage: photo ? `linear-gradient(180deg, rgba(15,26,60,0.05) 25%, rgba(15,26,60,0.88)), url(${photo})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
      }}
    >
      <button
        type="button"
        className="icon-btn"
        aria-label={photo ? 'Changer la photo' : 'Ajouter une photo'}
        style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.9)', border: 0 }}
        onClick={() => champ.current?.click()}
        disabled={busy}
      >
        <IcPhoto />
      </button>
      <input ref={champ} type="file" accept="image/*" hidden onChange={choisir} />
      {aRecadrer && <Recadreur fichier={aRecadrer} ratio={2} sortie={1000} onValider={envoyerPhoto} onAnnuler={() => setARecadrer(null)} />}
      <span className="badge" style={{ alignSelf: 'flex-start' }}>
        {d.annee?.name ? `Année ${d.annee.name}` : 'Établissement'}
      </span>
      <h2 style={{ marginTop: 8 }}>{nom || 'Mon établissement'}</h2>
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

// Accueil de l'etablissement : la journee en 3 chiffres, ce qui attend, puis 3 portes d'entree.
// Messages, Informer et Abonnement ne sont pas repetes ici : ils sont dans la barre du bas, le bouton « + » et le Profil.
function EspaceEtablissement() {
  const { user } = useAuth()
  const t = useApi('/api/etablissement/tableau')
  const abs = useApi(`/api/notes/absences?date=${aujourdhuiLocal()}`)
  const prof = useApi(`/api/presence-enseignants?date=${aujourdhuiLocal()}`)
  const ordres = useApi('/api/scolarite/ordres?statut=paye,litige')
  const demandes = useApi('/api/familles/demandes')
  const boutique = useApi('/api/boutique/gestion')
  const d = t.data || {}
  const aPreparer = boutique.data ? boutique.data.commandes.filter((c) => c.statut === 'payee').length : 0
  const aVerifier = prof.data ? prof.data.cours.filter((c) => c.etat === 'a_verifier').length : null
  const aConfirmer = ordres.data?.length ?? null
  // Mise en route : les 5 etapes qui rendent l'etablissement operationnel (affichees tant qu'il en reste)
  const etapes = [
    [d.eleves > 0, '#/dossier', 'Ajouter les élèves', 'Photo, Excel ou PDF des listes de classes : tout est reconnu'],
    [d.enseignants > 0, '#/import-enseignants', 'Ajouter les enseignants', 'La liste des enseignants et de leurs classes'],
    [d.frais > 0, '#/scolarite?onglet=frais', 'Saisir les frais', 'Pension, APEE, tranches et échéances'],
    [d.numeros, '#/scolarite?onglet=frais', 'Numéros Orange Money et MTN', 'Pour recevoir les paiements des parents'],
    [d.creneaux > 0, '#/import-emplois', 'Emplois du temps', 'Une photo par classe suffit'],
  ]
  const faites = etapes.filter((e) => e[0]).length
  const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
  const resteARembourser = Math.max(0, (d.abonnement || 0) - (d.gain_service || 0))
  const taches = [
    d.enseignants_attente > 0 && ['#/enseignants', `${d.enseignants_attente} enseignant(s) à valider`, 'Vérifiez et validez leurs comptes'],
    demandes.data?.length > 0 && ['#/rattachements', `${demandes.data.length} parent(s) à valider`, 'Demandes de suivi d’un élève'],
    aPreparer > 0 && ['#/boutique-gestion', `${aPreparer} commande(s) de la boutique à préparer`, 'Payées par les parents, à préparer puis à remettre'],
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
      <EnteteEtablissement d={d} ecole={user.schoolId} onChange={() => t.reload()} />

      {t.data && faites < etapes.length && (
        <>
          <h2 className="section-title">{`Mise en route · ${faites}/${etapes.length}`}</h2>
          <ol className="etapes">
            {etapes.map(([fait, href, titre, texte], i) => (
              <li key={titre}>
                <span className="numero" style={fait ? { background: 'var(--ok)' } : undefined}>
                  {fait ? <IcCoche size={16} /> : i + 1}
                </span>
                <a href={href} style={{ color: 'inherit', flex: 1 }}>
                  <b style={fait ? { color: 'var(--muted)' } : undefined}>{titre}</b>
                  <span>{fait ? 'Fait' : texte}</span>
                </a>
              </li>
            ))}
          </ol>
        </>
      )}

      <h2 className="section-title">Aujourd’hui</h2>
      <div className="jour-chiffres">
        <a href="#/absences">
          <b className={abs.data?.absents ? 'rouge' : ''}>{abs.data ? abs.data.absents : '…'}</b>
          <span>élève(s) absent(s)</span>
        </a>
        <a href="#/presence-enseignants">
          <b>{aVerifier ?? '…'}</b>
          <span>cours à vérifier</span>
        </a>
        <a href="#/scolarite?onglet=confirmer">
          <b className={aConfirmer ? 'rouge' : ''}>{aConfirmer ?? '…'}</b>
          <span>paiement(s) à confirmer</span>
        </a>
      </div>

      {t.data && (d.abonnement > 0 || d.gain_service > 0 || d.gain_boutique > 0) && (
        <>
          <h2 className="section-title">Ce que Sùkûl vous rapporte cette année</h2>
          <div className="jour-chiffres">
            <a href="#/scolarite">
              <b style={{ fontSize: 'clamp(16px, 4.4vw, 24px)', color: 'var(--ok)' }}>{fcfa(d.gain_service)}</b>
              <span>frais de service encaissés</span>
            </a>
            <a href="#/boutique-gestion">
              <b style={{ fontSize: 'clamp(16px, 4.4vw, 24px)' }}>{fcfa(d.gain_boutique)}</b>
              <span>ventes de la boutique</span>
            </a>
            <a href="#/abonnement">
              <b style={{ fontSize: 'clamp(16px, 4.4vw, 24px)' }}>{fcfa(d.abonnement)}</b>
              <span>abonnement Sùkûl par an</span>
            </a>
          </div>
          {d.abonnement > 0 && (
            <p className="muted" style={{ fontSize: 14, margin: '8px 2px 0' }}>
              {resteARembourser ? `Encore ${fcfa(resteARembourser)} de frais de service et votre abonnement est remboursé.` : 'Les frais de service ont déjà remboursé votre abonnement.'}
            </p>
          )}
        </>
      )}

      {taches.length > 0 && (
        <>
          <h2 className="section-title">À faire</h2>
          {taches.map(([href, titre, texte]) => (
            <Action key={href} href={href} Icone={IcCoche} titre={titre} texte={texte} urgent />
          ))}
        </>
      )}

      <h2 className="section-title">Mon établissement</h2>
      <div className="grille-tuiles quatre cinq">
        <Tuile href="#/eleves" Icone={IcEleves} titre="Élèves" texte="Listes, classes, fiches" chiffre={d.eleves ?? '…'} />
        <Tuile href="#/presence-enseignants" Icone={IcProf} titre="Enseignants" texte="Présence et cours du jour" chiffre={d.enseignants ?? '…'} />
        <Tuile href="#/scolarite" Icone={IcCarte} titre="Scolarité" texte="Frais, paiements, guichet" />
        <Tuile href="#/verifier" Icone={IcScan} titre="Vérifier un paiement" texte="Par le matricule de l’élève" />
        <Tuile href="#/boutique-gestion" Icone={IcSac} titre="Boutique" texte="Tenues, fournitures, commandes" />
      </div>
    </>
  )
}

// Accueil du parent, du tuteur ou du donateur : ses enfants, puis le fil d'informations
// Accueil du parent : ses enfants en cartes (chacun sa couleur), leurs dernieres notes, puis les informations
const TEINTES = [
  ['#2f6bff', '#5b3df5'],
  ['#0e9f8e', '#0b6e8a'],
  ['#e0683a', '#c23d5a'],
  ['#8b5cf6', '#c026d3'],
  ['#0ea5e9', '#2563eb'],
]
const n20p = (n) => (n === null || n === undefined ? '—' : Number(n).toFixed(2).replace('.', ','))
const rangTexte = (r) => (r === 1 ? '1er' : `${r}e`)

function CarteEnfant({ e, i }) {
  const [a, b] = TEINTES[i % TEINTES.length]
  const r = e.resultat
  return (
    <a className="par-enfant" href={`#/suivi/${e.id}`} style={{ '--c1': a, '--c2': b }}>
      <span className="par-enfant-tete">
        <span className="par-avatar">{`${(e.prenom || '?')[0]}${(e.nom || '')[0] || ''}`}</span>
        <span className="par-enfant-nom">
          <b data-brut>{e.prenom}</b>
          <small data-brut>{[e.classe || 'Classe non précisée', e.ecole].filter(Boolean).join(' · ')}</small>
        </span>
        <IcChevron size={16} />
      </span>
      <span className="par-chiffres">
        <span>
          <b>{r ? n20p(r.moyenne) : '—'}</b>
          <small>{r ? `Moyenne séq. ${r.sequence}` : 'Moyenne'}</small>
        </span>
        <span>
          <b>{r?.rang ? rangTexte(r.rang) : '—'}</b>
          <small>{r?.rang ? `sur ${r.sur}` : 'Rang'}</small>
        </span>
        <span>
          <b>{e.absencesMois}</b>
          <small>{e.absencesMois > 1 ? 'Absences ce mois' : 'Absence ce mois'}</small>
        </span>
      </span>
      {e.devoirs > 0 && <span className="par-devoirs">{e.devoirs > 1 ? `${e.devoirs} devoirs à faire` : '1 devoir à faire'}</span>}
    </a>
  )
}

function EspaceParent() {
  const enfants = useApi('/api/suivi/eleves')
  const liste = enfants.data || []
  // dernieres notes de tous les enfants, la plus recente d'abord
  const notes = liste
    .flatMap((e, i) => (e.dernieresNotes || []).map((x) => ({ ...x, enfant: e, i })))
    .sort((x, y) => String(y.date_eval || '').localeCompare(String(x.date_eval || '')))
    .slice(0, 5)
  return (
    <div className="par-accueil">
      <section>
        <div className="par-titre">
          <h2>{liste.length > 1 ? 'Mes enfants' : 'Mon enfant'}</h2>
          <a href="#/trouver-eleve">
            <IcPlus size={15} />
            <span>Ajouter</span>
          </a>
        </div>
        {enfants.data && !liste.length ? (
          <a className="par-vide" href="#/trouver-eleve">
            <IcFamille size={26} />
            <b>Ajoutez votre enfant</b>
            <small>Retrouvez-le avec son établissement et sa classe pour suivre ses notes, ses absences et sa scolarité.</small>
          </a>
        ) : (
          <div className={`par-enfants ${liste.length === 1 ? 'seul' : ''}`}>
            {liste.map((e, i) => (
              <CarteEnfant key={e.id} e={e} i={i} />
            ))}
          </div>
        )}
      </section>

      {notes.length > 0 && (
        <section>
          <div className="par-titre">
            <h2>Dernières notes</h2>
          </div>
          <ul className="par-notes">
            {notes.map((x, k) => {
              const [c1] = TEINTES[x.i % TEINTES.length]
              const sur = Number(x.bareme)
              return (
                <li key={k}>
                  <a href={`#/suivi/${x.enfant.id}`}>
                    <span className="par-pastille" style={{ background: c1 }}>
                      {(x.enfant.prenom || '?')[0]}
                    </span>
                    <span className="par-note-texte">
                      <b data-brut>{x.matiere}</b>
                      <small data-brut>{liste.length > 1 ? `${x.enfant.prenom} · ${x.titre}` : x.titre}</small>
                    </span>
                    <b className={`par-note ${x.absent ? '' : Number(x.note) >= sur / 2 ? 'ok' : 'ko'}`}>{x.absent ? 'Abs.' : `${Number(x.note).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}/${sur}`}</b>
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section>
        <div className="par-titre">
          <h2>Informations</h2>
        </div>
        <Fil enfants={[]} />
      </section>
    </div>
  )
}

// Accueil de l'eleve : son suivi, puis le fil d'informations
function EspaceEleve() {
  const moi = useApi('/api/suivi/eleves')
  return <Fil enfants={moi.data || []} />
}


// Accueil de l'enseignant : le cours du moment, 4 actions, ses classes, puis le fil
// Enseignant dans plusieurs etablissements : l'etablissement ouvert, et les autres d'un geste
// --- Accueil de l'enseignant : un agenda (bandeau du jour, semaine, frise des cours, raccourcis) ---
const jourIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const plusJours = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return jourIso(d)
}
const fait = (c) => Boolean(c.confirme_le || c.etat === 'assure')

// Un cours supplementaire (hors emploi du temps) sur la frise
function PointSupp({ x }) {
  return (
    <li className="fr-cours supp">
      <span className="fr-heure">
        <b>{x.heure}</b>
      </span>
      <span className="fr-point" aria-hidden="true" />
      <a className="fr-carte" href={`#/infos/${x.id}`}>
        <b data-brut>{x.titre}</b>
        {x.lieu && <small data-brut>{x.lieu}</small>}
        <em className="fr-badge">Cours supplémentaire</em>
      </a>
    </li>
  )
}

// Un cours sur la frise du jour
function PointFrise({ c, v, onMaj }) {
  const [msg, setMsg] = useState('')
  const auj = v.date === v.aujourdhui
  const t = v.maintenant
  const enCours = auj && c.debut <= t && t < c.fin
  const passe = v.date < v.aujourdhui || (auj && t >= c.fin)
  const etat = c.absent ? 'absent' : fait(c) ? 'fait' : enCours ? 'maintenant' : passe ? 'manque' : 'avenir'
  const heure = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Douala' })
  async function present() {
    setMsg('…')
    try {
      if (await confirmerCours(c, v.date)) setMsg('attente')
      else {
        setMsg('')
        onMaj()
      }
    } catch (err) {
      setMsg(err.message)
    }
  }
  return (
    <li className={`fr-cours ${etat}`}>
      <span className="fr-heure">
        <b>{c.debut}</b>
        <small>{c.fin}</small>
      </span>
      <span className="fr-point" aria-hidden="true">
        {etat === 'fait' && <IcCoche size={12} />}
      </span>
      <div className="fr-carte">
        <b>{c.classe}</b>
        <small>{[c.matiere, c.salle ? `Salle ${c.salle}` : ''].filter(Boolean).join(' · ')}</small>
        {etat === 'maintenant' && <em className="fr-badge">En cours</em>}
        {etat === 'fait' && c.confirme_le && <em className="fr-note">{`Présence confirmée à ${heure(c.confirme_le)}`}</em>}
        {etat === 'manque' && <em className="fr-note">Présence non confirmée</em>}
        {etat === 'absent' && <em className="fr-note">Absence signalée</em>}
        {(confirmable(c, v) || enCours) && msg !== 'attente' && (
          <div className="fr-actions">
            {confirmable(c, v) && (
              <button type="button" className="btn" disabled={msg === '…'} onClick={present}>
                {msg === '…' ? '…' : 'Je suis en cours'}
              </button>
            )}
            {enCours && (
              <a className="btn btn-quiet" href={`#/classes/${c.class_id}/appel`}>
                {c.appel ? 'Appel fait' : 'Faire l’appel'}
              </a>
            )}
          </div>
        )}
        {msg === 'attente' && <em className="fr-note">Présence gardée sur le téléphone : envoyée dès le retour du réseau</em>}
        {msg && msg !== '…' && msg !== 'attente' && <p className="cours-erreur">{msg}</p>}
      </div>
    </li>
  )
}

// Enseignant : ses etablissements (changer, en rejoindre un autre) et son espace parent, en tete de l'accueil
function EnTeteEnseignant() {
  const { user, changerEspace, changerEtablissement } = useAuth()
  const d = useApi('/api/inscriptions/mes-etablissements')
  const [feuille, setFeuille] = useState(false)
  const [busy, setBusy] = useState(null)
  const membres = d.data?.membres || []
  const attente = (d.data?.demandes || []).filter((x) => x.status === 'pending')
  const actuel = membres.find((m) => m.ouvert)
  // meme barre que dans l'espace parent (Enseignant | Parent) ; la liste des etablissements s'ouvre juste dessous
  return (
    <div className="ens-entete-zone">
      <div className="espaces ens-espaces" role="tablist" aria-label="Changer d’espace">
        <button type="button" role="tab" aria-selected="true" aria-expanded={feuille} onClick={() => setFeuille((x) => !x)}>
          <IcEcole size={18} />
          <span>
            <b>Enseignant</b>
            <small data-brut>{actuel?.ecole || user.schoolName || '—'}</small>
          </span>
          <IcChevron size={14} style={{ transform: feuille ? 'rotate(-90deg)' : 'rotate(90deg)', marginLeft: 'auto', flex: 'none' }} />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected="false"
          disabled={busy === 'parent'}
          onClick={async () => {
            setBusy('parent')
            try {
              await changerEspace('parent')
            } catch {
              // l'espace actuel reste affiche
            }
            setBusy(null)
          }}
        >
          <IcProfil size={18} />
          <span>
            <b>Parent</b>
            <small>{busy === 'parent' ? '…' : 'Mes enfants'}</small>
          </span>
        </button>
      </div>

      {feuille && (
        <>
          <div className="ens-menu-fond" onClick={() => setFeuille(false)} />
          <div className="ens-menu">
            <ul className="ens-etabs">
              {membres.map((m) => (
                <li key={m.school_id}>
                  <button
                    type="button"
                    aria-pressed={m.ouvert}
                    disabled={busy !== null}
                    onClick={() => {
                      if (m.ouvert) return setFeuille(false)
                      setBusy(m.school_id)
                      changerEtablissement(m.school_id).catch(() => setBusy(null))
                    }}
                  >
                    <span className="ens-entete-ico">
                      <IcEcole size={18} />
                    </span>
                    <span className="ens-entete-texte">
                      <b data-brut>{m.ecole}</b>
                      <small data-brut>{busy === m.school_id ? 'Ouverture…' : m.ouvert ? 'Ouvert en ce moment' : m.city || ''}</small>
                    </span>
                    {m.ouvert && <IcCoche size={18} />}
                  </button>
                </li>
              ))}
              {attente.map((x) => (
                <li key={`d${x.id}`}>
                  <div className="ens-etabs-attente">
                    <span className="ens-entete-ico">
                      <IcEcole size={18} />
                    </span>
                    <span className="ens-entete-texte">
                      <b data-brut>{x.ecole}</b>
                      <small>En attente de validation</small>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <a className="ens-menu-ajout" href="#/mes-etablissements">
              <IcPlus size={16} /> Rejoindre un autre établissement
            </a>
          </div>
        </>
      )}
    </div>
  )
}

// Accueil de l'enseignant, en bas les jours ou il a peu de cours : sa semaine en un coup d'oeil
const duree = (m) => (m % 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m / 60} h`)
const NOMS_JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
function MaSemaine({ auj }) {
  const r = useApi('/api/notes/mon-resume')
  const semaine = r.data?.semaine || []
  const total = semaine.reduce((s, j) => s + j.cours, 0)
  if (!total) return null
  const minutes = semaine.reduce((s, j) => s + j.minutes, 0)
  const max = Math.max(...semaine.map((j) => j.minutes), 1)
  const ajd = ((new Date(`${auj}T12:00:00`).getDay() + 6) % 7) + 1
  return (
    <section className="ens-suivre ens-sem">
      <h2>Ma semaine</h2>
      <div className="ens-sem-carte">
        <div className="ens-sem-chiffres">
          <div>
            <b>{total}</b>
            <small>Cours</small>
          </div>
          <div>
            <b>{duree(minutes)}</b>
            <small>Heures</small>
          </div>
          <a href="#/mes-classes">
            <b>{r.data.classes}</b>
            <small>Classes</small>
          </a>
          <div>
            <b>{r.data.eleves}</b>
            <small>Élèves</small>
          </div>
        </div>
        <ul className="ens-sem-jours">
          {semaine.map((j) => (
            <li key={j.jour} className={j.jour === ajd ? 'auj' : ''}>
              <span>{NOMS_JOURS[j.jour - 1]}</span>
              <i style={{ '--p': `${Math.round((j.minutes / max) * 100)}%` }} />
              <small>{j.cours ? `${j.cours} cours · ${duree(j.minutes)}` : 'Libre'}</small>
            </li>
          ))}
        </ul>
        <a className="ens-sem-pied" href="#/emploi">
          Voir l’emploi du temps <IcChevron size={14} />
        </a>
      </div>
    </section>
  )
}

function EspaceEnseignant() {
  const jour = useApi('/api/presence-enseignants/mes-cours')
  const v = jour.data
  const auj = v?.aujourdhui || jourIso(new Date())
  // calendrier : uniquement les jours ou l'enseignant a cours (emploi du temps ou cours supplementaire), 7 au plus
  const joursCours = []
  if (v) {
    for (let i = 0; i < 28 && joursCours.length < 7; i++) {
      const iso = plusJours(auj, i)
      const isoDow = ((new Date(`${iso}T12:00:00`).getDay() + 6) % 7) + 1
      if ((v.jours || []).includes(isoDow) || (v.joursSupp || []).includes(iso)) joursCours.push(iso)
    }
  }
  const [choisi, setChoisi] = useState(null)
  const actif = choisi || joursCours[0] || auj
  const sel = actif !== auj ? actif : null
  const autre = useApi(sel ? `/api/presence-enseignants/mes-cours?date=${sel}` : null)
  const vue = sel ? autre.data : v
  const date = (iso, o) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', o)
  const assures = (v?.cours || []).filter(fait).length
  // la frise : cours de l'emploi du temps et cours supplementaires, dans l'ordre des heures
  const elements = vue ? [...vue.cours.map((c) => ({ h: c.debut, c })), ...(vue.supplementaires || []).map((x) => ({ h: x.heure, x }))].sort((a, b) => a.h.localeCompare(b.h)) : []


  return (
    <div className="ens-accueil">
      <EnTeteEnseignant />
      <section className="ens-agenda">
        {joursCours.length > 0 && (
          <div className="ens-semaine" role="tablist" aria-label="Choisir un jour">
            {joursCours.map((iso) => (
              <button key={iso} type="button" role="tab" aria-selected={actif === iso} onClick={() => setChoisi(iso)}>
                <small>{iso === auj ? 'Auj.' : date(iso, { weekday: 'short' }).replace('.', '')}</small>
                <b>{date(iso, { day: 'numeric' })}</b>
              </button>
            ))}
          </div>
        )}
        <div className="ens-agenda-tete">
          <h2>
            {sel ? date(sel, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Aujourd’hui'}
            {!sel && v?.cours.length > 0 && <small>{`${assures}/${v.cours.length} assurés`}</small>}
          </h2>
        </div>
        {!vue && <p className="muted">Chargement…</p>}
        {vue?.absence && <div className="note">{`Absence signalée ce jour${vue.absence.motif ? ` : ${vue.absence.motif}` : ''}.`}</div>}
        {vue && elements.length === 0 && (
          <div className="ens-repos">
            <b>Aucun cours</b>
            <small>{vue.total ? 'Votre emploi du temps ne prévoit pas de cours ce jour-là.' : 'Votre emploi du temps apparaîtra ici dès que l’établissement l’aura saisi.'}</small>
          </div>
        )}
        {elements.length > 0 && (
          <ol className="frise">
            {elements.map(({ c, x }) =>
              c ? (
                <PointFrise key={`${vue.date}-${c.class_id}-${c.debut}`} c={c} v={vue} onMaj={() => (sel ? autre.reload() : jour.reload())} />
              ) : (
                <PointSupp key={`s${x.id}`} x={x} />
              ),
            )}
          </ol>
        )}
      </section>
      {vue && elements.length < 4 && <MaSemaine auj={auj} />}
    </div>
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
      {user.role !== 'teacher' && <ChoixEspace />}
      {user.role !== 'admin' && user.schoolId && <BandeauAbonnement role={user.role} />}
      {user.role === 'admin' && <EspaceAdmin />}
      {user.role === 'principal' && <EspaceEtablissement />}
      {user.role === 'parent' && <EspaceParent />}
      {user.role === 'student' && <EspaceEleve />}
      {user.role === 'teacher' && <EspaceEnseignant />}
    </>
  )
}
