import { useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { useDepotPage } from '../depot.jsx'
import CompteurIA from '../CompteurIA.jsx'
import { Field, Note } from '../ui.jsx'
import { IcImport } from '../icones.jsx'

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
  ['autre', 'Document', 'Autres documents'],
]
const REFUS = {
  cahier_appel: ['Ce document est un cahier d’appel : il sert à mettre à jour les absences, pas à être affiché aux familles.', '#/import-absences', 'Mettre à jour les absences'],
  liste_eleves: ['Ce document est une liste d’élèves : il ne sera pas affiché aux familles.', '#/import-eleves', 'Importer cette liste d’élèves'],
  discipline: ['Ce document concerne la discipline : il ne sera pas affiché dans le fil.', '#/discipline', 'Enregistrer les sanctions'],
  notes_nominatives: ['Ce document contient des notes d’élèves nommés : il ne sera pas affiché dans le fil. Les notes se saisissent dans Notes.', null, null],
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

// Un document lu peut aussi alimenter une autre page (en plus d'etre publie)
const AUSSI = {
  emploi: ['#/import-emplois', 'Ajouter aussi aux emplois du temps des classes'],
  scolarite: ['#/scolarite?onglet=frais', 'Mettre à jour les frais de scolarité'],
}
const PUBLICS = { tous: 'Tout le monde', parents: 'Parents', eleves: 'Élèves', enseignants: 'Enseignants' }
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const groupeDe = (libelle) => (CATEGORIES.find((c) => c[1] === libelle) || CATEGORIES[CATEGORIES.length - 1])[2]
const jour = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const sansAccent = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

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
  const [type, setType] = useState('')
  const [q, setQ] = useState('')

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
      setItems((l) => [...l, { id, nom: x.name, etape: 'envoi', ...VIDE }])
      setEtat(`Lecture ${k + 1} / ${choix.length}…`)
      try {
        const envoye = await envoyer(x)
        maj(id, { fichier: envoye, type: envoye.type, etape: 'lecture' })
        const a = (await api.post('/api/actualites/documents/analyser', { url: envoye.url, mime: envoye.mime, nom: envoye.nom })).data
        maj(id, { analyse: a, etape: 'pret', titre: a.titre || '', categorie: a.categorie || 'autre', description: a.resume || '', dateEvenement: a.dateEvenement || '', lieu: a.lieu || '' })
      } catch (err) {
        maj(id, { etape: 'erreur', message: err.message })
      }
    }
    setEtat('')
  }
  const zoneDepot = useDepotPage(choisir, { texte: 'Déposez vos documents', detail: 'PDF, Word, Excel, PowerPoint, photos, vidéos' })

  const publiables = items.filter((x) => x.etape === 'pret' && !REFUS[x.analyse?.nature])
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
      setOk(n === 1 ? '✓ Document publié : il apparaît dans le fil des familles.' : `✓ ${n} documents publiés : ils apparaissent dans le fil des familles.`)
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

  // Liste publiee : types presents (dans l'ordre des categories), filtre, recherche, puis groupes par mois
  const docs = [...(liste.data || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const parType = new Map()
  for (const d of docs) parType.set(groupeDe(d.categorie), (parType.get(groupeDe(d.categorie)) || 0) + 1)
  const types = [...new Set(CATEGORIES.map((c) => c[2]))].filter((g) => parType.has(g))
  const filtres = docs.filter((d) => (!type || groupeDe(d.categorie) === type) && (!q.trim() || sansAccent(d.title).includes(sansAccent(q.trim()))))
  const mois = []
  for (const d of filtres) {
    const dt = new Date(d.created_at)
    const cle = `${MOIS[dt.getMonth()]} ${dt.getFullYear()}`
    if (!mois.length || mois[mois.length - 1].cle !== cle) mois.push({ cle, docs: [] })
    mois[mois.length - 1].docs.push(d)
  }

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
            const refus = x.analyse && REFUS[x.analyse.nature]
            const aussi = !refus && AUSSI[x.categorie]
            return (
              <div key={x.id} className="doc-carte">
                <div className="doc-entete">
                  <span className="doc-badge">{ETIQUETTE(x.nom, x.type)}</span>
                  <span className="doc-nom">
                    <b data-brut>{x.nom}</b>
                    {(x.etape === 'envoi' || x.etape === 'lecture') && <small>{x.etape === 'envoi' ? 'Envoi…' : 'Lecture et classement…'}</small>}
                  </span>
                  <button type="button" className="doc-croix" aria-label="Ne pas ajouter ce document" title="Ne pas ajouter ce document" onClick={() => retirerItem(x.id)}>
                    ×
                  </button>
                </div>
                {x.etape === 'erreur' && <Note>{x.message}</Note>}
                {x.etape === 'pret' && refus && (
                  <div className="doc-refus">
                    <p>{refus[0]}</p>
                    {refus[1] && (
                      <a className="btn btn-block" href={refus[1]}>
                        {refus[2]}
                      </a>
                    )}
                  </div>
                )}
                {x.etape === 'pret' && !refus && (
                  <div className="doc-champs">
                    <Field label="Titre">
                      <input className="input" value={x.titre} onChange={(e) => maj(x.id, { titre: e.target.value })} />
                    </Field>
                    <div className="grid2">
                      <Field label="Type de document">
                        <select className="input" value={x.categorie} onChange={(e) => maj(x.id, { categorie: e.target.value })}>
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
                    <Field label="Résumé pour les familles (facultatif)">
                      <textarea className="input" value={x.description} onChange={(e) => maj(x.id, { description: e.target.value })} style={{ minHeight: 56 }} />
                    </Field>
                    {aussi && (
                      <a className="lien-action" href={aussi[0]}>
                        {aussi[1]}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {publiables.length > 0 && (
            <div className="actions">
              <button type="button" className="btn" onClick={publier} disabled={Boolean(etat)}>
                {publiables.length === 1 ? 'Publier' : `Publier les ${publiables.length} documents`}
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
          {types.length > 1 && (
            <div className="chips docs-types">
              <button type="button" className="chip" aria-pressed={!type} onClick={() => setType('')}>
                Tous · {docs.length}
              </button>
              {types.map((g) => (
                <button key={g} type="button" className="chip" aria-pressed={type === g} onClick={() => setType(type === g ? '' : g)}>
                  {g} · {parType.get(g)}
                </button>
              ))}
            </div>
          )}
          {docs.length > 8 && <input className="input docs-recherche" type="search" placeholder="Rechercher un document" value={q} onChange={(e) => setQ(e.target.value)} />}
          {filtres.length === 0 && <p className="muted">Aucun document.</p>}
          {mois.map((m) => (
            <section key={m.cle}>
              <p className="niveau-titre">{m.cle}</p>
              <ul className="liste-simple">
                {m.docs.map((d) => {
                  const f = Array.isArray(d.medias) ? d.medias[0] : null
                  return (
                    <li key={d.id}>
                      <span className="doc-badge">{ETIQUETTE(f?.nom || d.title || '', f?.type || 'document')}</span>
                      <span className="ls-texte">
                        <b>{d.title}</b>
                        <small>
                          {groupeDe(d.categorie) === 'Autres documents' ? 'Document' : d.categorie} · {jour(d.created_at)}
                          {d.audience && d.audience !== 'tous' ? ` · ${PUBLICS[d.audience] || ''}` : ''}
                          {d.last_name && !d.mien ? ` · ${d.first_name} ${d.last_name}` : ''}
                        </small>
                        <span className="ls-actions">
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
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  )
}
