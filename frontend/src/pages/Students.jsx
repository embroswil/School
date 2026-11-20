import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { NiveauRepliable, Note, useNiveauxOuverts } from '../ui.jsx'
import { IcChevron, IcClasses, IcImport } from '../icones.jsx'
import { useAuth } from '../auth.jsx'
import { niveauClasse, trierClasses } from '../classes.js'
import StatutScolarite from './StatutScolarite.jsx'
import { TableauTriable, exporterExcel, surOrdinateur } from '../export.jsx'

// La classe ouverte et la recherche sont gardees le temps de la visite :
// en revenant de la fiche d'un eleve, on retrouve la liste ou on l'avait laissee.
const CLE = 'sukul-eleves'
const memoire = () => {
  try {
    return JSON.parse(sessionStorage.getItem(CLE) || '{}')
  } catch (_) {
    return {}
  }
}
const nombre = (n) => Number(n || 0).toLocaleString('fr-FR')

// Eleves de l'etablissement : classes regroupees par niveau, puis eleves de la classe choisie.
// Les noms ne s'affichent qu'apres le choix d'une classe ou une recherche.
export default function Students() {
  const [niveauxOuverts, basculerNiveau] = useNiveauxOuverts('eleves')
  const { user } = useAuth()
  const [q, setQ] = useState(() => memoire().q || '')
  const [recherche, setRecherche] = useState(() => memoire().q || '')
  const [classe, setClasse] = useState(() => memoire().classe ?? '') // '' | id de classe | '0' (sans classe)
  const [scol, setScol] = useState('') // '' | 'regle' | 'non'
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)

  // La recherche part 350 ms apres la derniere lettre tapee
  useEffect(() => {
    const t = setTimeout(() => setRecherche(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => {
    try {
      sessionStorage.setItem(CLE, JSON.stringify({ q: recherche, classe }))
    } catch (_) {
      /* stockage indisponible */
    }
  }, [recherche, classe])

  const enRecherche = recherche.length >= 2
  const resume = useApi('/api/etablissement/eleves/resume')
  const classes = useApi('/api/etablissement/classes')
  const eleves = useApi(
    enRecherche ? `/api/etablissement/eleves?q=${encodeURIComponent(recherche)}` : classe !== '' ? `/api/etablissement/eleves?classe=${classe}` : null,
  )

  async function placer(eleveId, classId) {
    if (!classId) return
    setError('')
    setBusy(eleveId)
    try {
      await api.post(`/api/etablissement/eleves/${eleveId}/classe`, { classId: Number(classId) })
      eleves.reload()
      resume.reload()
      classes.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(null)
  }
  const ouvrir = (id) => {
    setScol('')
    setError('')
    setClasse(String(id))
    window.scrollTo(0, 0)
  }
  const fermer = () => {
    setScol('')
    setError('')
    setClasse('')
    setQ('')
    setRecherche('')
  }

  const listeClasses = trierClasses(classes.data || [])
  const r = resume.data
  const classeOuverte = classe === '0' ? { name: 'Élèves sans classe' } : listeClasses.find((c) => String(c.id) === classe)
  const statutDe = (e) => (!e.scol_du ? 'aucun' : e.scol_paye >= e.scol_du ? 'regle' : e.scol_paye > 0 ? 'partiel' : 'non_paye')
  const tous = eleves.loading && !busy ? [] : eleves.data || []
  const regles = tous.filter((e) => statutDe(e) === 'regle').length
  const nonRegles = tous.filter((e) => ['partiel', 'non_paye'].includes(statutDe(e))).length
  const liste = scol === 'regle' ? tous.filter((e) => statutDe(e) === 'regle') : scol === 'non' ? tous.filter((e) => ['partiel', 'non_paye'].includes(statutDe(e))) : tous
  const libelleStatut = { regle: 'Réglée', partiel: 'Partielle', non_paye: 'Non payée', aucun: '' }
  const exporter = () =>
    exporterExcel(`eleves-${(classeOuverte?.name || 'recherche').replace(/\s+/g, '-')}`, [
      {
        nom: 'Élèves',
        lignes: liste.map((e) => ({
          Nom: e.last_name,
          'Prénom(s)': e.first_name,
          Classe: e.class_name || e.declared_class || '',
          Matricule: e.matricule || '',
          'Date de naissance': e.date_of_birth ? new Date(e.date_of_birth).toLocaleDateString('fr-FR') : '',
          'Parents reliés': e.parents || 0,
          'Compte créé': e.a_un_compte ? 'Oui' : 'Non',
          'Frais obligatoires (FCFA)': e.scol_du || 0,
          'Payé (FCFA)': e.scol_paye || 0,
          'Reste (FCFA)': Math.max(0, (e.scol_du || 0) - (e.scol_paye || 0)),
          Scolarité: libelleStatut[statutDe(e)],
        })),
      },
    ])

  // Classes regroupees par niveau (6e, 5e… Tle), dans l'ordre naturel
  const niveaux = []
  for (const c of listeClasses) {
    const n = niveauClasse(c.name)
    const dernier = niveaux[niveaux.length - 1]
    if (dernier && dernier.nom === n) dernier.classes.push(c)
    else niveaux.push({ nom: n, classes: [c] })
  }

  const choixClasse = (e) => (
    <select
      className="input eleves-placer"
      value=""
      onClick={(ev) => ev.stopPropagation()}
      disabled={busy === e.id || !listeClasses.length}
      onChange={(ev) => placer(e.id, ev.target.value)}
      aria-label="Placer dans une classe"
    >
      <option value="">{e.declared_class ? `${e.declared_class} → placer…` : 'Placer…'}</option>
      {listeClasses.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )

  const vueListe = enRecherche || classe !== ''

  return (
    <>
      <div className="eleves-tete">
        <div>
          <h1 className="page-title">Élèves</h1>
          <p className="muted">{r ? `${nombre(r.eleves)} élève(s) · ${listeClasses.length} classe(s)` : 'Chargement…'}</p>
        </div>
        <a className="btn bouton-icone" href="#/import-eleves">
          <IcImport size={18} /> Importer
        </a>
      </div>

      <input
        className="input eleves-recherche"
        type="search"
        enterKeyHint="search"
        placeholder="Rechercher un élève (nom ou prénom)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <Note>{error}</Note>

      {/* ---------- accueil de la page : chiffres, puis classes par niveau ---------- */}
      {!vueListe && (
        <>
          {r && r.eleves > 0 && (
            <div className="eleves-chiffres">
              <div>
                <b>{nombre(r.eleves)}</b>
                <span>Élèves</span>
              </div>
              <div>
                <b>{nombre(r.parents_relies)}</b>
                <span>Parents reliés</span>
              </div>
              <div>
                <b>{nombre(r.comptes)}</b>
                <span>Comptes créés</span>
              </div>
            </div>
          )}
          {r && r.sans_classe > 0 && (
            <button type="button" className="eleves-alerte" onClick={() => ouvrir(0)}>
              <span>
                <b>{nombre(r.sans_classe)} élève(s) sans classe</b>
                <small>Placez-les dans leur classe</small>
              </span>
              <IcChevron size={18} />
            </button>
          )}
          {user?.role === 'principal' && (
            <a className="eleves-lien" href="#/emplois">
              <span className="eleves-lien-ico">
                <IcClasses size={20} />
              </span>
              <span>
                <b>Emplois du temps</b>
                <small>Cours de chaque classe</small>
              </span>
              <IcChevron size={18} />
            </a>
          )}
          {niveaux.map((n) => (
            <NiveauRepliable
              key={n.nom}
              nom={n.nom}
              resume={`${n.classes.length} classe(s) · ${nombre(n.classes.reduce((t, c) => t + (c.eleves || 0), 0))} élève(s)`}
              ouvert={Boolean(niveauxOuverts[n.nom])}
              onBasculer={() => basculerNiveau(n.nom)}
            >
              <div className="eleves-classes">
                {n.classes.map((c) => (
                  <button type="button" key={c.id} onClick={() => ouvrir(c.id)}>
                    <b>{c.name}</b>
                    <small>{nombre(c.eleves)} élève(s)</small>
                  </button>
                ))}
              </div>
            </NiveauRepliable>
          ))}
          {classes.data && r && r.eleves === 0 && <p className="lede">Aucun élève pour l’instant. Importez vos listes de classe pour commencer.</p>}
          {classes.data && (
            <p className="eleves-pied">
              <a href="#/classes">{listeClasses.length ? 'Gérer les classes' : 'Créer les classes'}</a>
            </p>
          )}
        </>
      )}

      {/* ---------- eleves d'une classe, ou resultats de la recherche ---------- */}
      {vueListe && (
        <>
          <div className="eleves-barre">
            <button type="button" className="back" onClick={fermer}>
              ← Toutes les classes
            </button>
          </div>
          <h2 className="eleves-titre">
            {enRecherche ? `Résultats pour « ${recherche} »` : classeOuverte?.name || 'Classe'}
            <small>{eleves.loading ? 'Chargement…' : `${nombre(tous.length)} élève(s)`}</small>
          </h2>
          {tous.some((e) => e.scol_du) && (
            <div className="chips">
              <button type="button" className="chip" aria-pressed={!scol} onClick={() => setScol('')}>
                Tous
              </button>
              <button type="button" className="chip" aria-pressed={scol === 'regle'} onClick={() => setScol('regle')}>
                Scolarité réglée ({regles})
              </button>
              <button type="button" className="chip" aria-pressed={scol === 'non'} onClick={() => setScol('non')}>
                Non réglée ({nonRegles})
              </button>
            </div>
          )}
          {liste.length > 0 && surOrdinateur() && (
            <TableauTriable
              lignes={liste}
              onLigne={(e) => (window.location.hash = `/eleves/${e.id}`)}
              colonnes={[
                { cle: 'last_name', titre: 'Nom', rendu: (e) => <b>{e.last_name}</b> },
                { cle: 'first_name', titre: 'Prénom(s)' },
                { cle: 'class_name', titre: 'Classe', rendu: (e) => (e.class_id ? e.class_name : choixClasse(e)) },
                { cle: 'matricule', titre: 'Matricule' },
                { cle: 'parents', titre: 'Parents', style: { textAlign: 'center' } },
                { cle: 'a_un_compte', titre: 'Compte', rendu: (e) => (e.a_un_compte ? 'Oui' : '—'), tri: (e) => (e.a_un_compte ? 1 : 0) },
                {
                  cle: 'reste',
                  titre: 'Scolarité',
                  tri: (e) => Math.max(0, (e.scol_du || 0) - (e.scol_paye || 0)),
                  rendu: (e) => <StatutScolarite statut={statutDe(e)} reste={(e.scol_du || 0) - (e.scol_paye || 0)} />,
                },
              ]}
            />
          )}
          {liste.length > 0 && !surOrdinateur() && (
            <ul className="liste-eleves">
              {liste.map((e) => (
                <li key={e.id}>
                  <a href={`#/eleves/${e.id}`}>
                    <span className="initiales" data-brut>
                      {(e.last_name || '?')[0]}
                      {(e.first_name || '')[0]}
                    </span>
                    <span className="nom">
                      <b data-brut>
                        {e.last_name} {e.first_name}
                      </b>
                      <small>
                        {enRecherche || !e.class_id ? e.class_name || `Déclaré : ${e.declared_class || '—'}` : e.matricule || ''}
                        {e.parents > 0 ? ` · ${e.parents} parent(s)` : ''}
                        {e.a_un_compte ? ' · compte' : ''}
                      </small>
                    </span>
                    <StatutScolarite statut={statutDe(e)} reste={e.scol_du - e.scol_paye} />
                  </a>
                  {!e.class_id && choixClasse(e)}
                </li>
              ))}
            </ul>
          )}
          {liste.length > 0 && (
            <button type="button" className="lien-discret" onClick={exporter}>
              Exporter en Excel
            </button>
          )}
          {!eleves.loading && eleves.data && liste.length === 0 && (
            <p className="lede">{enRecherche ? 'Aucun élève trouvé. Vérifiez l’orthographe.' : 'Aucun élève dans cette classe.'}</p>
          )}
        </>
      )}
    </>
  )
}
