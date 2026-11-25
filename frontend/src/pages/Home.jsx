import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { langue } from '../i18n.jsx'
import { useApi } from '../hooks.js'
import { Publication } from './Actualites.jsx'
import { CarteEleve } from './Suivi.jsx'
import { BandeauAbonnement } from './Abonnement.jsx'
import Fil from './Fil.jsx'
import Recadreur from '../Recadreur.jsx'
import { IcBillets, IcSac, IcFamille, IcActus, IcCarte, IcChevron, IcClasses, IcCoche, IcDocument, IcEcole, IcEleves, IcPhoto, IcPlus, IcProf, IcProfil, IcBouclier, IcTableau } from '../icones.jsx'
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

function EnteteEtablissement({ d, ecole, prenom, onChange }) {
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
  // en-tete : le nom a gauche, la photo de l'etablissement a droite qui se fond dans le fond de la page
  return (
    <section className="ent-hero">
      <div className="ent-hero-photo" style={photo ? { backgroundImage: `url(${photo})` } : undefined}>
        <button type="button" aria-label={photo ? 'Changer la photo' : 'Ajouter une photo'} onClick={() => champ.current?.click()} disabled={busy}>
          <IcPhoto size={16} />
        </button>
      </div>
      <input ref={champ} type="file" accept="image/*" hidden onChange={choisir} />
      {aRecadrer && <Recadreur fichier={aRecadrer} ratio={2} sortie={1000} onValider={envoyerPhoto} onAnnuler={() => setARecadrer(null)} />}
      <div className="ent-hero-texte">
        <span className="ent-hero-badge">
          <IcEcole size={15} /> Établissement
        </span>
        <b data-brut>{nom || 'Mon établissement'}</b>
        {d.annee?.name && <span>{`Année scolaire ${d.annee.name}`}</span>}
        {prenom && <small>{`Bonjour, ${prenom}`}</small>}
      </div>
    </section>
  )
}

const aujourdhuiLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const LOCALE = langue === 'en' ? 'en-GB' : 'fr-FR'
const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
const leMois = (m, format) => new Date(`${m}-15T12:00:00`).toLocaleDateString(LOCALE, { month: format })

// Encaissements des 6 derniers mois : courbe, chaque colonne se touche (ou se survole) pour lire son montant
function CourbeEncaissements({ mois }) {
  const [sel, setSel] = useState(mois.length - 1)
  const W = 320
  const H = 120
  const max = Math.max(1, ...mois.map((m) => Number(m.total)))
  const y = (v) => H - 6 - (v / max) * (H - 20)
  const pts = mois.map((m, i) => [((i + 0.5) * W) / mois.length, y(Number(m.total))])
  const ligne = pts.map((p) => p.join(',')).join(' ')
  const m = mois[sel]
  return (
    <section className="db-panneau db-large">
      <div className="db-titre">
        <b>Encaissements · 6 mois</b>
        <small data-brut>{`${leMois(m.mois, 'long')} : ${fcfa(m.total)}`}</small>
      </div>
      <div className="db-courbe">
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {[0.5, 1].map((f) => (
            <line key={f} x1="0" x2={W} y1={y(max * f)} y2={y(max * f)} className="db-repere" />
          ))}
          <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="db-repere" />
          <polygon points={`${pts[0][0]},${y(0)} ${ligne} ${pts[pts.length - 1][0]},${y(0)}`} className="db-aire" />
          <polyline points={ligne} className="db-ligne" />
          <line x1={pts[sel][0]} x2={pts[sel][0]} y1="0" y2={y(0)} className="db-curseur" />
          {pts.map(([x, py], i) => (
            <circle key={i} cx={x} cy={py} r={i === sel ? 5 : 3.5} className="db-point" />
          ))}
        </svg>
        <div className="db-axe">
          {mois.map((x, i) => (
            <button key={x.mois} type="button" aria-pressed={i === sel} aria-label={`${leMois(x.mois, 'long')} : ${fcfa(x.total)}`} onClick={() => setSel(i)} onMouseEnter={() => setSel(i)} data-brut>
              {leMois(x.mois, 'short').replace('.', '')}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

// Garcons et filles : anneau, chaque part nommee avec son nombre (la couleur n'est jamais seule)
function RepartitionEleves({ s }) {
  const total = s.g + s.f
  const C = 2 * Math.PI * 40
  const ecart = total && s.g && s.f ? 2 : 0
  const pg = total ? (s.g / total) * C : 0
  return (
    <section className="db-panneau">
      <div className="db-titre">
        <b>Élèves</b>
      </div>
      <div className="db-anneau">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="40" className="db-serie-2" strokeDasharray={`${Math.max(0, C - pg - ecart)} ${C}`} transform={`rotate(${-90 + (pg * 360) / C + ecart} 50 50)`} />
          <circle cx="50" cy="50" r="40" className="db-serie-1" strokeDasharray={`${Math.max(0, pg - ecart)} ${C}`} transform="rotate(-90 50 50)" />
        </svg>
        <span>
          <b>{nombre(total)}</b>
          <small>élèves</small>
        </span>
      </div>
      <ul className="db-legende">
        {[
          ['db-serie-1', 'Garçons', s.g],
          ['db-serie-2', 'Filles', s.f],
        ].map(([c, nom, n]) => (
          <li key={nom}>
            <i className={c} />
            <span>{nom}</span>
            <b>{`${nombre(n)} · ${total ? Math.round((n / total) * 100) : 0} %`}</b>
          </li>
        ))}
      </ul>
    </section>
  )
}

// Un chiffre cle de l'accueil : icone (ou anneau) a gauche, valeur et libelle, petit graphique a droite
function Chiffre({ href, Icone, teinte, valeur, libelle, detail, tendance, visuel, children }) {
  return (
    <a className={`chiffre ${teinte}`} href={href}>
      {visuel || (
        <span className="chiffre-ico">
          <Icone size={26} />
        </span>
      )}
      <span className="chiffre-texte">
        {valeur != null && <b>{valeur}</b>}
        <span>{libelle}</span>
        <small>
          {tendance != null && <i className={tendance < 0 ? 'baisse' : 'hausse'} title="Par rapport au mois dernier">{`${tendance > 0 ? '+' : ''}${tendance} %`}</i>}
          {detail}
        </small>
      </span>
      {children}
    </a>
  )
}

// Courbe des 6 derniers mois, sans axe (tendance seulement)
function Tendance({ valeurs }) {
  const max = Math.max(1, ...valeurs)
  const pts = valeurs.map((v, i) => `${(i * 100) / (valeurs.length - 1)},${36 - (v / max) * 32}`).join(' ')
  return (
    <svg className="chiffre-courbe" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} />
    </svg>
  )
}

function EspaceEtablissement() {
  const { user } = useAuth()
  const t = useApi('/api/etablissement/tableau')
  // graphiques et courbe des encaissements : seulement sur ordinateur
  const ordi = document.documentElement.classList.contains('ordi')
  const st = useApi(ordi ? '/api/etablissement/statistiques' : null)
  const abs = useApi(`/api/notes/absences?date=${aujourdhuiLocal()}`)
  const d = t.data || {}
  const s = st.data
  // Mise en route : les 5 etapes qui rendent l'etablissement operationnel (affichees tant qu'il en reste)
  const etapes = [
    [d.eleves > 0, '#/dossier', 'Ajouter les élèves', 'Photo, Excel ou PDF des listes de classes : tout est reconnu'],
    [d.enseignants > 0, '#/import-enseignants', 'Ajouter les enseignants', 'La liste des enseignants et de leurs classes'],
    [d.frais > 0, '#/scolarite?onglet=frais', 'Saisir les frais', 'Pension, APEE, tranches et échéances'],
    [d.numeros, '#/scolarite?onglet=frais', 'Numéros Orange Money et MTN', 'Pour recevoir les paiements des parents'],
    [d.creneaux > 0, '#/import-emplois', 'Emplois du temps', 'Une photo par classe suffit'],
  ]
  const faites = etapes.filter((e) => e[0]).length
  // chiffres du mois et tendance face au mois precedent
  const ceMois = t.data ? Number(d.encaisse_mois) : null
  const avant = Number(d.encaisse_mois_avant || 0)
  const tendance = ceMois != null && avant > 0 ? Math.round(((ceMois - avant) / avant) * 100) : null
  const presence = d.eleves > 0 && abs.data ? Math.max(0, 1 - abs.data.absents / d.eleves) : null
  const pct = (x) => `${(Math.round(x * 1000) / 10).toLocaleString(LOCALE)} %`
  // semaine : jours de classe (le samedi seulement s'il y a eu un appel)
  const jours = (s?.semaine || []).filter((j) => j.appels > 0 || new Date(`${j.jour}T12:00:00`).getDay() !== 6)
  const maxAbs = Math.max(1, ...jours.map((j) => j.absents))
  const presenceSemaine = d.eleves > 0 && jours.length ? 1 - jours.reduce((x, j) => x + j.absents, 0) / jours.length / d.eleves : null
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
      <EnteteEtablissement d={d} ecole={user.schoolId} prenom={user.firstName} onChange={() => t.reload()} />

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

      {/* acces directs, en tuiles defilantes */}
      <nav className="ent-actions" aria-label="Accès directs">
        {[
          ['#/eleves', IcEleves, 'Élèves'],
          ['#/presence-enseignants', IcProf, 'Enseignants'],
          ['#/scolarite', IcCarte, 'Scolarité'],
          ['#/actualites', IcDocument, 'Documents'],
          ['#/boutique-gestion', IcSac, 'Boutique'],
          ['#/conseil-classe', IcClasses, 'Conseil de classe'],
          ['#/conseil-enseignement', IcTableau, 'Conseil d’enseignement'],
        ].map(([href, Icone, titre]) => (
          <a key={href} href={href}>
            <Icone size={24} />
            <span>{titre}</span>
          </a>
        ))}
      </nav>

      <div className="chiffres">
        <Chiffre href="#/eleves" Icone={IcEleves} teinte="bleu" valeur={nombre(d.eleves)} libelle="Élèves" detail={t.data && `${nombre(d.classes)} classe(s)`} />
        <Chiffre
          href="#/presence-enseignants"
          Icone={IcProf}
          teinte="violet"
          valeur={nombre(d.enseignants)}
          libelle="Enseignants"
          detail={t.data && (d.enseignants_attente > 0 ? `${d.enseignants_attente} à valider` : 'comptes validés')}
        />
        <Chiffre href="#/scolarite" Icone={IcBillets} teinte="vert" valeur={nombre(ceMois)} libelle="FCFA ce mois" tendance={tendance}>
          {s?.mois && <Tendance valeurs={s.mois.map((m) => Number(m.total))} />}
        </Chiffre>
        <Chiffre
          href="#/absences"
          teinte="bleu"
          libelle="Présence aujourd’hui"
          detail={abs.data && `${abs.data.absents} absent(s)`}
          visuel={
            <span className="chiffre-anneau">
              <svg viewBox="0 0 44 44" aria-hidden="true">
                <circle cx="22" cy="22" r="19" />
                <circle cx="22" cy="22" r="19" strokeDasharray={`${(presence || 0) * 119.4} 119.4`} transform="rotate(-90 22 22)" />
              </svg>
              <b>{presence == null ? '…' : pct(presence).replace(' %', '%')}</b>
            </span>
          }
        />
      </div>

      <a className="ent-verifier" href="#/verifier">
        <IcBouclier size={34} />
        <b>Vérifier un reçu</b>
        <small>Scannez le code d’un reçu pour savoir s’il est authentique.</small>
        <span>
          Scanner <IcChevron size={14} />
        </span>
      </a>

      {/* sur ordinateur : graphiques de l'annee */}
      {st.error && <p className="muted">{st.error}</p>}
      {s && (
        <div className="db-grille">
          <CourbeEncaissements mois={s.mois} />
          {s.sexes.g + s.sexes.f > 0 && <RepartitionEleves s={s.sexes} />}

          <section className="db-panneau db-moitie">
            <div className="db-titre">
              <b>Absences de la semaine</b>
              {presenceSemaine != null && <small>{`Présence moyenne ${pct(presenceSemaine)}`}</small>}
            </div>
            <div className="cpt-colonnes db-colonnes">
              {jours.map((j) => (
                <div key={j.jour} title={`${j.absents} absent(s)`}>
                  <b>{j.absents}</b>
                  <span className="cpt-barres">
                    <i className="db-barre" style={{ height: `${(j.absents / maxAbs) * 100}%` }} />
                  </span>
                  <small data-brut>{new Date(`${j.jour}T12:00:00`).toLocaleDateString(LOCALE, { weekday: 'short' }).replace('.', '')}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="db-panneau db-moitie">
            <div className="db-titre">
              <b>Moyennes par matière</b>
              <a href="#/conseil-enseignement">Rapport</a>
            </div>
            {!s.matieres?.length && <p className="muted">Aucune note cette année.</p>}
            <ul className="db-matieres">
              {(s.matieres || []).map((m) => (
                <li key={m.matiere}>
                  <span>{m.matiere}</span>
                  <b>{`${n20p(m.moyenne)}/20`}</b>
                  <span className="suivi-barre">
                    <i style={{ width: `${m.moyenne * 5}%` }} className={m.moyenne >= 12 ? '' : m.moyenne >= 10 ? 'moyen' : 'faible'} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
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
    </a>
  )
}

// Devoirs d'un enfant : cartes de couleur, comme des fiches
function DevoirsEnfant({ e, plusieurs, decalage }) {
  const d = useApi(`/api/suivi/eleves/${e.id}/devoirs`)
  const pour = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
  return (d.data || [])
    .filter((x) => !x.pour_le || String(x.pour_le).slice(0, 10) >= aujourdhuiLocal())
    .slice(0, 6)
    .map((x, k) => {
      const [c1, c2] = TEINTES[(k + decalage * 2) % TEINTES.length]
      return (
        <a key={x.id} className="par-devoir" href={`#/suivi/${e.id}`} style={{ '--c1': c1, '--c2': c2 }}>
          <small data-brut>{plusieurs ? `${e.prenom} · ${x.matiere}` : x.matiere}</small>
          <b data-brut>{x.titre}</b>
          {x.pour_le && <span data-brut>{`${langue === 'en' ? 'Due' : 'Pour le'} ${pour(x.pour_le)}`}</span>}
        </a>
      )
    })
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

      {liste.some((e) => e.devoirs > 0) && (
        <section>
          <div className="par-titre">
            <h2>Devoirs à faire</h2>
          </div>
          <div className="par-defile">
            {liste.map((e, i) => e.devoirs > 0 && <DevoirsEnfant key={e.id} e={e} plusieurs={liste.length > 1} decalage={i} />)}
          </div>
        </section>
      )}

      {notes.length > 0 && (
        <section>
          <div className="par-titre">
            <h2>Dernières notes</h2>
          </div>
          <div className="par-defile">
            {notes.map((x, k) => {
              const sur = Number(x.bareme)
              const p = x.absent ? 0 : Math.min(100, (Number(x.note) / sur) * 100)
              return (
                <a key={k} className="par-resultat" href={`#/suivi/${x.enfant.id}`}>
                  <span className="par-pastille" style={{ background: TEINTES[x.i % TEINTES.length][0] }}>
                    {(x.enfant.prenom || '?')[0]}
                  </span>
                  <b data-brut>{x.matiere}</b>
                  <small data-brut>{liste.length > 1 ? `${x.enfant.prenom} · ${x.titre}` : x.titre}</small>
                  <span className="par-resultat-pied">
                    <span className="suivi-barre">
                      <i style={{ width: `${p}%` }} className={x.absent ? '' : p >= 60 ? '' : p >= 50 ? 'moyen' : 'faible'} />
                    </span>
                    <em>{x.absent ? 'Abs.' : `${Number(x.note).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}/${sur}`}</em>
                  </span>
                </a>
              )
            })}
          </div>
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
      <div className="fr-carte couleur" style={{ '--c1': TEINTES[c.class_id % TEINTES.length][0], '--c2': TEINTES[c.class_id % TEINTES.length][1] }}>
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

// Enseignant : carte d'en-tete (nom, etablissement ouvert, chiffres du jour) ; l'etablissement se change en touchant son nom.
// L'espace parent se trouve dans la barre du haut.
function EnTeteEnseignant({ cours }) {
  const { user, changerEtablissement } = useAuth()
  const d = useApi('/api/inscriptions/mes-etablissements')
  const r = useApi('/api/notes/mon-resume')
  const [feuille, setFeuille] = useState(false)
  const [busy, setBusy] = useState(null)
  const membres = d.data?.membres || []
  const attente = (d.data?.demandes || []).filter((x) => x.status === 'pending')
  const actuel = membres.find((m) => m.ouvert)
  const assures = (cours || []).filter(fait).length
  return (
    <div className="ens-entete-zone">
      <section className="par-enfant ens-hero" style={{ '--c1': TEINTES[0][0], '--c2': TEINTES[0][1] }}>
        <span className="par-enfant-tete">
          <span className="par-avatar">{`${(user.firstName || '?')[0]}${(user.lastName || '')[0] || ''}`}</span>
          <span className="par-enfant-nom">
            <b data-brut>{`${user.firstName || ''} ${user.lastName || ''}`.trim()}</b>
            <button type="button" className="ens-hero-etab" aria-expanded={feuille} onClick={() => setFeuille((x) => !x)}>
              <span data-brut>{actuel?.ecole || user.schoolName || '—'}</span>
              <IcChevron size={14} style={{ transform: feuille ? 'rotate(-90deg)' : 'rotate(90deg)', flex: 'none' }} />
            </button>
          </span>
        </span>
        <span className="par-chiffres">
          <span>
            <b>{cours ? `${assures}/${cours.length}` : '…'}</b>
            <small>Cours assurés</small>
          </span>
          <a href="#/mes-classes">
            <b>{r.data ? r.data.classes : '…'}</b>
            <small>Classes</small>
          </a>
          <span>
            <b>{r.data ? r.data.eleves : '…'}</b>
            <small>Élèves</small>
          </span>
        </span>
      </section>

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
  // la frise : cours de l'emploi du temps et cours supplementaires, dans l'ordre des heures
  const elements = vue ? [...vue.cours.map((c) => ({ h: c.debut, c })), ...(vue.supplementaires || []).map((x) => ({ h: x.heure, x }))].sort((a, b) => a.h.localeCompare(b.h)) : []


  return (
    <div className="ens-accueil">
      <EnTeteEnseignant cours={v?.cours} />
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
      {user.role !== 'admin' && user.schoolId && <BandeauAbonnement role={user.role} />}
      {user.role === 'admin' && <EspaceAdmin />}
      {user.role === 'principal' && <EspaceEtablissement />}
      {user.role === 'parent' && <EspaceParent />}
      {user.role === 'student' && <EspaceEleve />}
      {user.role === 'teacher' && <EspaceEnseignant />}
    </>
  )
}
