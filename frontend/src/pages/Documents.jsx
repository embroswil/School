import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { confierFichiers, useDepotPage } from '../depot.jsx'
import { preparerDocument } from '../lecture-fichier.js'
import CompteurIA from '../CompteurIA.jsx'
import { Field, Note } from '../ui.jsx'
import { IcChevron, IcImport } from '../icones.jsx'

// Categories (memes cles que le serveur)
// [cle, libelle enregistre, nom du groupe dans la liste]
export const CATEGORIES = [
  ['communique', 'Communiqué', 'Communiqués'],
  ['reunion', 'Réunion', 'Réunions'],
  ['scolarite', 'Scolarité', 'Scolarité'],
  ['emploi', 'Emploi du temps', 'Emplois du temps'],
  ['calendrier', 'Calendrier', 'Calendriers'],
  ['examen', 'Examens', 'Examens'],
  ['resultats', 'Résultats', 'Résultats'],
  ['absences', 'Récapitulatif des absences', 'Absences'],
  ['fournitures', 'Fournitures', 'Fournitures'],
  ['cantine', 'Cantine', 'Cantine'],
  ['evenement', 'Événement', 'Événements'],
  ['administration', 'Administration', 'Administration'],
  ['autre', 'Document', 'Autres documents'],
]
// Documents qui ne vont pas dans le fil : ils alimentent une page de l'etablissement.
// [page, type reconnu, bouton, peut aussi etre publie pour les familles]
const DESTINATIONS = {
  liste_enseignants: ['/import-enseignants', 'Liste des enseignants', 'Ajouter à l’équipe enseignante', false],
  liste_eleves: ['/import-eleves', 'Liste d’élèves', 'Importer les élèves', false],
  cahier_appel: ['/import-absences', 'Cahier d’appel', 'Mettre à jour les absences', false],
  emploi_du_temps: ['/import-emplois', 'Emploi du temps', 'Ajouter aux emplois du temps', true],
  frais: ['/scolarite?onglet=frais', 'Frais de scolarité', 'Mettre à jour les frais', true],
  discipline: ['/discipline', 'Discipline', 'Enregistrer les sanctions', false],
  notes_nominatives: [null, 'Notes d’élèves', null, false],
}
const CATEGORIE_DE = { emploi_du_temps: 'emploi', frais: 'scolarite' }

// Reconnaissance du document d'apres son contenu (Excel, Word, PDF avec texte) et son nom
const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
function reconnaitre(nom, texte) {
  const t = sansAccents(`${nom}\n${String(texte || '').slice(0, 8000)}`)
  if (/service des enseignants|heures \/ semaine|heures supplementaires|budget|comptabilite|journal des (encaissements|depenses)|tresorerie|etat de recouvrement|absences des enseignants|bilan par enseignant/.test(t))
    return { nature: 'interne', categorie: 'administration' }
  if (/cahier d.appel|feuille d.appel|feuille de presence/.test(t)) return { nature: 'cahier_appel' }
  if (/recapitulatif.{0,20}absences|absences des eleves/.test(t)) return { nature: 'interne', categorie: 'absences' }
  if (/enseignant|professeur|equipe pedagogique/.test(t) && /matiere/.test(t) && /classe/.test(t)) return { nature: 'liste_enseignants' }
  if (/matricule/.test(t) && /(date de naissance|nee? le|sexe)/.test(t)) return { nature: 'liste_eleves' }
  if (/emploi du temps|emploi-du-temps/.test(t) || (/lundi/.test(t) && /mardi/.test(t) && /mercredi/.test(t) && /\d{1,2}\s*[:h]\s*\d{2}/.test(t))) return { nature: 'emploi_du_temps' }
  if (/(sanction|conseil de discipline)/.test(t) && /(eleve|classe)/.test(t)) return { nature: 'discipline' }
  if (/(frais|pension|scolarite|apee?)\b/.test(t) && /montant/.test(t) && /(echeance|tranche)/.test(t)) return { nature: 'frais' }
  return null
}

// Photo reduite avant l'envoi (1600 px, JPEG)
const reduire = (fichier) =>
  new Promise((ok) => {
    const img = new Image()
    img.onload = () => {
      const r = Math.min(1, 1600 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * r)
      c.height = Math.round(img.height * r)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      c.toBlob((b) => ok(b || fichier), 'image/jpeg', 0.85)
    }
    img.onerror = () => ok(fichier)
    img.src = URL.createObjectURL(fichier)
  })

// Type du fichier (certains navigateurs ne le donnent pas pour Excel ou PowerPoint)
const MIMES = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv', txt: 'text/plain', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v',
}
const mimeDe = (f) => f.type || MIMES[(f.name.split('.').pop() || '').toLowerCase()] || ''
const ETIQUETTE = (nom, type) => {
  const e = (nom.split('.').pop() || '').toLowerCase()
  if (type === 'image') return 'IMG'
  if (type === 'video') return 'VIDÉO'
  return { pdf: 'PDF', doc: 'WORD', docx: 'WORD', xls: 'EXCEL', xlsx: 'EXCEL', ppt: 'PPT', pptx: 'PPT', csv: 'CSV', txt: 'TXT' }[e] || 'FICHIER'
}
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,image/*,video/*'

export async function envoyer(fichier) {
  const estImage = fichier.type.startsWith('image/')
  const blob = estImage ? await reduire(fichier) : fichier
  const mime = estImage ? 'image/jpeg' : mimeDe(fichier)
  const s = await api.post('/api/medias/signer', { mime, taille: blob.size })
  const r = await fetch(s.data.envoi, { method: 'PUT', headers: { 'Content-Type': mime }, body: blob })
  if (!r.ok) throw new Error('L’envoi du fichier a échoué. Vérifiez la connexion et réessayez.')
  return { type: s.data.type, url: s.data.url, nom: fichier.name, mime }
}

const PUBLICS = { tous: 'Tout le monde', parents: 'Parents', eleves: 'Élèves', enseignants: 'Enseignants', interne: 'Établissement seulement' }
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const groupeDe = (libelle) => (CATEGORIES.find((c) => c[1] === libelle) || CATEGORIES[CATEGORIES.length - 1])[2]
const jour = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const sansAccent = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Dossier (une couleur par type de document)
const COULEURS = { Communiqués: '#2f6bff', Réunions: '#7c4dff', Scolarité: '#12b76a', 'Emplois du temps': '#0ba5ec', Calendriers: '#f79009', Examens: '#ef6820', Résultats: '#ee46bc', Absences: '#f04438', Fournitures: '#875bf7', Cantine: '#eaaa08', Événements: '#06aed4', Administration: '#344054', 'Autres documents': '#667085' }
const Dossier = ({ couleur }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2h8.8A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" fill={couleur} />
    <path d="M3 9.5h18v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" fill="#fff" fillOpacity="0.22" />
  </svg>
)
const CLE_DOSSIER = 'sukul-documents-dossier'

const VIDE = { titre: '', categorie: 'autre', description: '', audience: 'tous', dateEvenement: '', lieu: '' }

// Documents de l'etablissement : ajout (lecture et classement automatiques), puis liste publiee
// rangee par type de document et par mois.
export default function Documents() {
  const { user } = useAuth()
  const champ = useRef(null)
  const liste = useApi('/api/actualites/documents')
  const [items, setItems] = useState([])
  const [etat, setEtat] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [type, setType] = useState(() => {
    try {
      return sessionStorage.getItem(CLE_DOSSIER) || ''
    } catch (_) {
      return ''
    }
  })
  const [q, setQ] = useState('')
  const [ouverts, setOuverts] = useState({})
  useEffect(() => {
    try {
      sessionStorage.setItem(CLE_DOSSIER, type)
    } catch (_) {
      /* stockage indisponible */
    }
  }, [type])
  const ouvrirDossier = (g) => {
    setType(g)
    setOuverts({})
    setQ('')
    window.scrollTo(0, 0)
  }

  const maj = (id, champs) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...champs } : x)))
  const retirerItem = (id) => setItems((l) => l.filter((x) => x.id !== id))

  async function choisir(e) {
    const choix = [...(e.target.files || [])].slice(0, 10)
    e.target.value = ''
    if (!choix.length) return
    setError('')
    setOk('')
    for (const [k, x] of choix.entries()) {
      const id = `${Date.now()}-${k}`
      const titre = x.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim()
      setItems((l) => [...l, { id, nom: x.name, source: x, etape: 'lecture', ...VIDE, titre }])
      setEtat(`Lecture ${k + 1} / ${choix.length}…`)
      try {
        // 1. contenu lu dans le navigateur (Excel, Word, PDF avec texte) : type reconnu sans attendre
        let texte = ''
        if (/\.(pdf|xlsx|xls|csv|ods|docx)$/i.test(x.name)) texte = (await preparerDocument([x]).catch(() => ({ texte: '' }))).texte || ''
        const vu = reconnaitre(x.name, texte)
        if (vu && DESTINATIONS[vu.nature]) {
          maj(id, { etape: 'pret', analyse: { nature: vu.nature }, categorie: CATEGORIE_DE[vu.nature] || 'autre' })
          continue
        }
        // 2. envoi, puis lecture automatique pour les PDF et les photos
        const envoye = await envoyer(x)
        maj(id, { fichier: envoye, type: envoye.type })
        let a = null
        if (!vu && (envoye.mime === 'application/pdf' || envoye.type === 'image')) a = (await api.post('/api/actualites/documents/analyser', { url: envoye.url, mime: envoye.mime, nom: envoye.nom })).data
        if (a && DESTINATIONS[a.nature]) {
          maj(id, { etape: 'pret', analyse: { nature: a.nature }, categorie: CATEGORIE_DE[a.nature] || 'autre' })
          continue
        }
        const nature = vu?.nature || a?.nature || 'information'
        const categorie = vu?.categorie || a?.categorie || 'autre'
        maj(id, {
          analyse: { nature },
          etape: 'pret',
          titre: a?.titre || titre,
          categorie,
          audience: nature === 'interne' || categorie === 'administration' ? 'interne' : 'tous',
          description: a?.resume || '',
          dateEvenement: a?.dateEvenement || '',
          lieu: a?.lieu || '',
        })
      } catch (err) {
        maj(id, { etape: 'erreur', message: err.message })
      }
    }
    setEtat('')
  }
  // Document qui alimente une autre page : il y est ouvert et lu directement
  function transmettre(x) {
    const d = DESTINATIONS[x.analyse.nature]
    confierFichiers([x.source])
    retirerItem(x.id)
    window.location.hash = d[0]
  }
  // « Publier quand meme » (emploi du temps, frais) : le document devient publiable
  async function publierAussi(x) {
    maj(x.id, { etape: 'lecture' })
    try {
      const envoye = x.fichier || (await envoyer(x.source))
      maj(x.id, { fichier: envoye, type: envoye.type, etape: 'pret', analyse: { nature: 'information' } })
    } catch (err) {
      maj(x.id, { etape: 'erreur', message: err.message })
    }
  }
  const zoneDepot = useDepotPage(choisir, { texte: 'Déposez vos documents', detail: 'PDF, Word, Excel, PowerPoint, photos, vidéos' })

  const publiables = items.filter((x) => x.etape === 'pret' && !DESTINATIONS[x.analyse?.nature])
  async function publier() {
    setError('')
    setOk('')
    let n = 0
    for (const x of publiables) {
      setEtat(`Publication ${n + 1} / ${publiables.length}…`)
      try {
        const { titre, categorie, description, audience, dateEvenement, lieu } = x
        await api.post('/api/actualites/documents', { titre, categorie, description, audience, dateEvenement, lieu, fichiers: [{ type: x.fichier.type, url: x.fichier.url, nom: x.fichier.nom }] })
        retirerItem(x.id)
        n += 1
      } catch (err) {
        maj(x.id, { etape: 'erreur', message: err.message })
      }
    }
    setEtat('')
    if (n) {
      setOk(n === 1 ? '✓ Document enregistré.' : `✓ ${n} documents enregistrés.`)
      liste.reload()
    }
  }

  async function retirer(id) {
    if (!window.confirm('Retirer ce document du fil ?')) return
    try {
      await api.delete(`/api/actualites/${id}`)
      liste.reload()
    } catch (err) {
      setError(err.message)
    }
  }

  // Liste publiee : un dossier par type de document ; dans un dossier, les documents par mois
  const docs = [...(liste.data || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const dossiers = new Map()
  for (const d of docs) {
    const g = groupeDe(d.categorie)
    if (!dossiers.has(g)) dossiers.set(g, [])
    dossiers.get(g).push(d)
  }
  const types = [...new Set(CATEGORIES.map((c) => c[2]))].filter((g) => dossiers.has(g))
  const recherche = q.trim()
  const dansDossier = type && dossiers.has(type)
  const visibles = recherche ? docs.filter((d) => sansAccent(`${d.title} ${d.categorie}`).includes(sansAccent(recherche))) : dansDossier ? dossiers.get(type) : []
  const mois = []
  for (const d of visibles) {
    const dt = new Date(d.created_at)
    const cle = `${MOIS[dt.getMonth()]} ${dt.getFullYear()}`
    if (!mois.length || mois[mois.length - 1].cle !== cle) mois.push({ cle, docs: [] })
    mois[mois.length - 1].docs.push(d)
  }
  // le mois le plus recent est ouvert, les autres se deplient au toucher
  const estOuvert = (cle, i) => (cle in ouverts ? ouverts[cle] : i === 0 || Boolean(recherche))

  return (
    <>
      {zoneDepot}
      <div className="page-tete">
        <div>
          <h1 className="page-title">Documents</h1>
          {liste.data && <p className="muted">{docs.length ? `${docs.length} document(s) publié(s)` : 'Aucun document publié'}</p>}
        </div>
        <button type="button" className="btn bouton-icone" onClick={() => champ.current?.click()} disabled={Boolean(etat)}>
          <IcImport size={18} /> Ajouter
        </button>
      </div>
      <input ref={champ} type="file" hidden multiple accept={ACCEPT} onChange={choisir} />
      <CompteurIA discret />
      <Note kind="ok">{ok}</Note>
      <Note>{error}</Note>

      {/* ---------- documents en cours d'ajout ---------- */}
      {items.length > 0 && (
        <section className="docs-ajout">
          <p className="niveau-titre">{etat || `À publier · ${items.length}`}</p>
          {items.map((x) => {
            const dest = x.analyse && DESTINATIONS[x.analyse.nature]
            const libelleType = (CATEGORIES.find((c) => c[0] === x.categorie) || CATEGORIES[CATEGORIES.length - 1])[1]
            return (
              <div key={x.id} className="doc-carte">
                <div className="doc-entete">
                  <span className="doc-badge">{ETIQUETTE(x.nom, x.type)}</span>
                  <span className="doc-nom">
                    <b>{x.etape === 'pret' && !dest ? x.titre || x.nom : x.nom}</b>
                    <small>
                      {x.etape === 'lecture' && 'Lecture…'}
                      {x.etape === 'pret' && dest && `${dest[1]} · ne sera pas publié`}
                      {x.etape === 'pret' && !dest && `${libelleType} · ${PUBLICS[x.audience]}`}
                    </small>
                  </span>
                  {x.etape === 'pret' && !dest && (
                    <button type="button" className="lien-action discret" onClick={() => maj(x.id, { ouvert: !x.ouvert })}>
                      {x.ouvert ? 'Fermer' : 'Modifier'}
                    </button>
                  )}
                  <button type="button" className="doc-croix" aria-label="Ne pas ajouter ce document" title="Ne pas ajouter ce document" onClick={() => retirerItem(x.id)}>
                    ×
                  </button>
                </div>
                {x.etape === 'erreur' && <Note>{x.message}</Note>}
                {x.etape === 'pret' && dest && (
                  <div className="doc-destination">
                    {dest[0] ? (
                      <button type="button" className="btn btn-block" onClick={() => transmettre(x)}>
                        {dest[2]}
                      </button>
                    ) : (
                      <p>Les notes se saisissent dans Notes : ce document n’est pas affiché aux familles.</p>
                    )}
                    {dest[3] && (
                      <button type="button" className="lien-action discret" onClick={() => publierAussi(x)}>
                        Publier aussi pour les familles
                      </button>
                    )}
                  </div>
                )}
                {x.etape === 'pret' && !dest && x.ouvert && (
                  <div className="doc-champs">
                    <Field label="Titre">
                      <input className="input" value={x.titre} onChange={(e) => maj(x.id, { titre: e.target.value })} />
                    </Field>
                    <div className="grid2">
                      <Field label="Type de document">
                        <select className="input" value={x.categorie} onChange={(e) => maj(x.id, { categorie: e.target.value, ...(e.target.value === 'administration' ? { audience: 'interne' } : {}) })}>
                          {CATEGORIES.filter((c) => c[0] !== 'absences' || user.role === 'principal').map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Visible par">
                        <select className="input" value={x.audience} onChange={(e) => maj(x.id, { audience: e.target.value })}>
                          <option value="tous">Tout le monde</option>
                          <option value="parents">Les parents</option>
                          <option value="eleves">Les élèves</option>
                          {user.role === 'principal' && <option value="enseignants">Les enseignants</option>}
                          {user.role === 'principal' && <option value="interne">L’établissement seulement</option>}
                        </select>
                      </Field>
                    </div>
                    {['reunion', 'evenement', 'examen', 'calendrier'].includes(x.categorie) && (
                      <div className="grid2">
                        <Field label="Date">
                          <input className="input" type="date" value={x.dateEvenement} onChange={(e) => maj(x.id, { dateEvenement: e.target.value })} />
                        </Field>
                        <Field label="Lieu">
                          <input className="input" value={x.lieu} onChange={(e) => maj(x.id, { lieu: e.target.value })} />
                        </Field>
                      </div>
                    )}
                    {x.audience !== 'interne' && (
                      <Field label="Résumé pour les familles (facultatif)">
                        <textarea className="input" value={x.description} onChange={(e) => maj(x.id, { description: e.target.value })} style={{ minHeight: 56 }} />
                      </Field>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {publiables.length > 0 && (
            <div className="actions">
              <button type="button" className="btn" onClick={publier} disabled={Boolean(etat)}>
                {publiables.length === 1 ? 'Enregistrer' : `Enregistrer les ${publiables.length} documents`}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setItems([])} disabled={Boolean(etat)}>
                Annuler
              </button>
            </div>
          )}
        </section>
      )}

      {/* ---------- documents publies : par type, puis par mois ---------- */}
      {liste.loading && !liste.data && <p className="muted">Chargement…</p>}
      {liste.data && docs.length === 0 && items.length === 0 && (
        <button type="button" className="import-zone" onClick={() => champ.current?.click()}>
          <IcImport size={26} />
          <b>Ajouter vos premiers documents</b>
          <small>Communiqués, calendriers, emplois du temps, frais, résultats… en PDF, Word, Excel, photo ou vidéo. Chaque document est lu et classé automatiquement.</small>
        </button>
      )}
      {docs.length > 0 && (
        <>
          {!dansDossier && <input className="input docs-recherche" type="search" placeholder="Rechercher un document" value={q} onChange={(e) => setQ(e.target.value)} />}

          {/* dossiers par type */}
          {!dansDossier && !recherche && (
            <div className="docs-dossiers">
              {types.map((g) => {
                const ds = dossiers.get(g)
                return (
                  <button key={g} type="button" className="doc-dossier" onClick={() => ouvrirDossier(g)}>
                    <Dossier couleur={COULEURS[g] || '#667085'} />
                    <b>{g}</b>
                    <small>
                      {ds.length} {ds.length > 1 ? 'documents' : 'document'}
                    </small>
                  </button>
                )
              })}
            </div>
          )}

          {/* contenu d'un dossier, ou resultats de la recherche */}
          {(dansDossier || recherche) && (
            <>
              {dansDossier && !recherche && (
                <div className="doc-dossier-tete">
                  <button type="button" className="back" onClick={() => ouvrirDossier('')}>
                    ← Tous les documents
                  </button>
                  <h2>
                    <Dossier couleur={COULEURS[type] || '#667085'} />
                    {type}
                    <small>{dossiers.get(type).length}</small>
                  </h2>
                </div>
              )}
              {recherche && <p className="niveau-titre">{`${visibles.length} résultat(s)`}</p>}
              {mois.map((m, i) => {
                const ouvert = estOuvert(m.cle, i)
                return (
                  <section key={m.cle} className="doc-mois">
                    <button type="button" className="doc-mois-tete" aria-expanded={ouvert} onClick={() => setOuverts((o) => ({ ...o, [m.cle]: !ouvert }))}>
                      <span>{m.cle}</span>
                      <small>{m.docs.length}</small>
                      <IcChevron size={16} style={{ transform: ouvert ? 'rotate(90deg)' : 'none' }} />
                    </button>
                    {ouvert && (
                      <ul className="liste-simple">
                        {m.docs.map((d) => {
                          const f = Array.isArray(d.medias) ? d.medias[0] : null
                          return (
                            <li key={d.id}>
                              <span className="doc-badge">{ETIQUETTE(f?.nom || d.title || '', f?.type || 'document')}</span>
                              <span className="ls-texte">
                                <b>{d.title}</b>
                                <small>
                                  {recherche ? `${d.categorie} · ` : ''}
                                  {jour(d.created_at)}
                                  {d.audience && d.audience !== 'tous' ? ` · ${PUBLICS[d.audience] || ''}` : ''}
                                  {d.last_name && !d.mien ? ` · ${d.first_name} ${d.last_name}` : ''}
                                </small>
                              </span>
                              <span className="doc-actions">
                                {f?.url && (
                                  <a className="lien-action" href={f.url} target="_blank" rel="noreferrer">
                                    Ouvrir
                                  </a>
                                )}
                                {(user.role === 'principal' || d.mien) && (
                                  <button type="button" className="lien-action discret" onClick={() => retirer(d.id)}>
                                    Retirer
                                  </button>
                                )}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </section>
                )
              })}
              {recherche && visibles.length === 0 && <p className="muted">Aucun document trouvé.</p>}
            </>
          )}
        </>
      )}
    </>
  )
}
