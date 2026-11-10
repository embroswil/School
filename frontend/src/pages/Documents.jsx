import { useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { useDepotPage } from '../depot.jsx'
import { Field, Note } from '../ui.jsx'

// Categories (memes cles que le serveur)
export const CATEGORIES = [
  ['communique', 'Communiqué'],
  ['reunion', 'Réunion'],
  ['emploi', 'Emploi du temps'],
  ['calendrier', 'Calendrier'],
  ['examen', 'Examens'],
  ['resultats', 'Résultats'],
  ['fournitures', 'Fournitures'],
  ['cantine', 'Cantine'],
  ['evenement', 'Événement'],
  ['autre', 'Document'],
]
const REFUS = {
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

// Televerser des documents : chacun est lu, classe et publie separement dans le fil des familles
const VIDE = { titre: '', categorie: 'autre', description: '', audience: 'tous', dateEvenement: '', lieu: '' }

export default function Documents() {
  const { user } = useAuth()
  const champ = useRef(null)
  const liste = useApi('/api/actualites/documents')
  const [items, setItems] = useState([])
  const [etat, setEtat] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

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
    await api.delete(`/api/actualites/${id}`)
    liste.reload()
  }

  return (
    <>
      {zoneDepot}
      <h1 className="page-title">Documents</h1>
      <p className="lede">Téléversez des communiqués, emplois du temps, calendriers, résultats… School lit chaque document, le classe et l’affiche aux familles.</p>
      <a className="btn btn-quiet btn-block" href="#/info" style={{ marginBottom: 12 }}>
        ✏️ Plutôt écrire une information (avec photos)
      </a>
      <input ref={champ} type="file" hidden multiple accept={ACCEPT} onChange={choisir} />
      <button type="button" className="depot" onClick={() => champ.current?.click()} disabled={Boolean(etat)}>
        <span style={{ fontSize: 34 }}>📄</span>
        <b>{etat || (items.length ? 'Ajouter d’autres documents' : 'Choisir des documents')}</b>
        <small>PDF, Word, Excel, PowerPoint, photos, vidéos · jusqu’à 10 fichiers</small>
        <small className="astuce-depot">ou glissez-déposez vos fichiers n’importe où sur cette page</small>
      </button>
      <Note kind="ok">{ok}</Note>
      <Note>{error}</Note>

      {items.map((x) => {
        const refus = x.analyse && REFUS[x.analyse.nature]
        return (
          <div key={x.id} className="card doc-carte">
            <div className="doc-entete">
              <span className="doc-badge">{ETIQUETTE(x.nom, x.type)}</span>
              <b className="doc-nom">{x.nom}</b>
              <button type="button" className="doc-croix" aria-label="Ne pas ajouter ce document" title="Ne pas ajouter ce document" onClick={() => retirerItem(x.id)}>
                ×
              </button>
            </div>
            {(x.etape === 'envoi' || x.etape === 'lecture') && <p className="muted" style={{ marginTop: 8 }}>{x.etape === 'envoi' ? 'Envoi…' : 'School lit le document…'}</p>}
            {x.etape === 'erreur' && <Note>{x.message}</Note>}
            {x.etape === 'pret' && refus && (
              <div style={{ marginTop: 10 }}>
                <Note>{refus[0]}</Note>
                {refus[1] && (
                  <a className="btn btn-block" href={refus[1]}>
                    {refus[2]}
                  </a>
                )}
              </div>
            )}
            {x.etape === 'pret' && !refus && (
              <div style={{ marginTop: 10 }}>
                <Field label="Titre">
                  <input className="input" value={x.titre} onChange={(e) => maj(x.id, { titre: e.target.value })} />
                </Field>
                <p className="doc-libelle">Catégorie</p>
                <div className="chips" style={{ marginBottom: 10 }}>
                  {CATEGORIES.map(([k, v]) => (
                    <button key={k} type="button" className="chip" aria-pressed={x.categorie === k} onClick={() => maj(x.id, { categorie: k })}>
                      {v}
                    </button>
                  ))}
                </div>
                <Field label="En bref (facultatif)">
                  <textarea className="input" value={x.description} onChange={(e) => maj(x.id, { description: e.target.value })} style={{ minHeight: 60 }} />
                </Field>
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
                <Field label="Visible par">
                  <select className="input" value={x.audience} onChange={(e) => maj(x.id, { audience: e.target.value })}>
                    <option value="tous">Tout le monde</option>
                    <option value="parents">Les parents</option>
                    <option value="eleves">Les élèves</option>
                    {user.role === 'principal' && <option value="enseignants">Les enseignants</option>}
                  </select>
                </Field>
              </div>
            )}
          </div>
        )
      })}
      {publiables.length > 0 && (
        <div className="actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={publier} disabled={Boolean(etat)}>
            {publiables.length === 1 ? 'Publier dans le fil' : `Publier les ${publiables.length} documents`}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setItems([])}>
            Tout annuler
          </button>
        </div>
      )}

      <h2 className="section-title">Documents publiés</h2>
      {liste.data?.length === 0 && <p className="muted">Aucun document pour le moment.</p>}
      {liste.data?.length > 0 && (
        <div className="docs-publies">
          {liste.data.map((d) => (
            <div key={d.id} className="doc-ligne">
              <span className="doc-badge">{ETIQUETTE(d.title || '', 'document')}</span>
              <span className="doc-texte">
                <b>{d.title}</b>
                <small>
                  <span className="doc-cat">{d.categorie || 'Document'}</span>
                  {new Date(d.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {d.last_name ? ` · ${d.first_name} ${d.last_name}` : ''}
                </small>
              </span>
              {(user.role === 'principal' || d.mien) && (
                <button type="button" className="btn btn-quiet btn-danger" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => retirer(d.id)}>
                  Retirer
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
