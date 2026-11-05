import { useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
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

async function envoyer(fichier) {
  const estImage = fichier.type.startsWith('image/')
  const blob = estImage ? await reduire(fichier) : fichier
  const mime = estImage ? 'image/jpeg' : fichier.type
  const s = await api.post('/api/medias/signer', { mime, taille: blob.size })
  const r = await fetch(s.data.envoi, { method: 'PUT', headers: { 'Content-Type': mime }, body: blob })
  if (!r.ok) throw new Error('L’envoi du fichier a échoué. Vérifiez la connexion et réessayez.')
  return { type: s.data.type, url: s.data.url, nom: fichier.name, mime }
}

// Televerser un document : School le lit, le classe et l'affiche dans le fil des familles
export default function Documents() {
  const { user } = useAuth()
  const champ = useRef(null)
  const liste = useApi('/api/actualites/documents')
  const [fichiers, setFichiers] = useState([])
  const [analyse, setAnalyse] = useState(null)
  const [f, setF] = useState({ titre: '', categorie: 'autre', description: '', audience: 'tous', dateEvenement: '', lieu: '' })
  const [etat, setEtat] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function choisir(e) {
    const choix = [...(e.target.files || [])].slice(0, 5)
    e.target.value = ''
    if (!choix.length) return
    setError('')
    setOk('')
    setAnalyse(null)
    try {
      const envoyes = []
      for (const [k, x] of choix.entries()) {
        setEtat(`Envoi ${k + 1} / ${choix.length}…`)
        envoyes.push(await envoyer(x))
      }
      setFichiers(envoyes)
      setEtat('School lit le document…')
      const a = (await api.post('/api/actualites/documents/analyser', { url: envoyes[0].url, mime: envoyes[0].mime, nom: envoyes[0].nom })).data
      setAnalyse(a)
      setF((v) => ({ ...v, titre: a.titre || '', categorie: a.categorie || 'autre', description: a.resume || '', dateEvenement: a.dateEvenement || '', lieu: a.lieu || '' }))
    } catch (err) {
      setError(err.message)
    }
    setEtat('')
  }

  async function publier() {
    setError('')
    setEtat('Publication…')
    try {
      await api.post('/api/actualites/documents', { ...f, fichiers: fichiers.map(({ type, url, nom }) => ({ type, url, nom })) })
      setOk('✓ Document publié : il apparaît dans le fil des familles.')
      setFichiers([])
      setAnalyse(null)
      setF({ titre: '', categorie: 'autre', description: '', audience: 'tous', dateEvenement: '', lieu: '' })
      liste.reload()
    } catch (err) {
      setError(err.message)
    }
    setEtat('')
  }

  async function retirer(id) {
    if (!window.confirm('Retirer ce document du fil ?')) return
    await api.delete(`/api/actualites/${id}`)
    liste.reload()
  }

  const refus = analyse && REFUS[analyse.nature]
  return (
    <>
      <h1 className="page-title">Documents</h1>
      <p className="lede">Téléversez un communiqué, un emploi du temps, un calendrier, des résultats… School le lit, le classe et l’affiche automatiquement aux familles.</p>
      <input ref={champ} type="file" hidden multiple accept="application/pdf,image/*" onChange={choisir} />
      {!fichiers.length && (
        <button type="button" className="depot" onClick={() => champ.current?.click()} disabled={Boolean(etat)}>
          <span style={{ fontSize: 34 }}>📄</span>
          <b>{etat || 'Choisir un document'}</b>
          <small>PDF ou photo · jusqu’à 5 fichiers</small>
        </button>
      )}
      <Note kind="ok">{ok}</Note>
      <Note>{error}</Note>
      {fichiers.length > 0 && (
        <div className="card">
          {fichiers.map((x, k) => (
            <div key={k} className="info-doc" style={{ marginTop: k ? 8 : 0 }}>
              <span className="info-doc-ico">{x.type === 'document' ? 'PDF' : 'IMG'}</span>
              <span style={{ minWidth: 0 }}>
                <b>{x.nom}</b>
              </span>
            </div>
          ))}
          {etat && <p className="muted" style={{ marginTop: 10 }}>{etat}</p>}
          {analyse && refus && (
            <div style={{ marginTop: 12 }}>
              <Note>{refus[0]}</Note>
              {refus[1] && (
                <a className="btn btn-block" href={refus[1]}>
                  {refus[2]}
                </a>
              )}
              <button type="button" className="btn btn-quiet btn-block" style={{ marginTop: 8 }} onClick={() => (setFichiers([]), setAnalyse(null))}>
                Choisir un autre document
              </button>
            </div>
          )}
          {analyse && !refus && (
            <div style={{ marginTop: 12 }}>
              <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                {analyse.ia ? '✓ Lu par School : vérifiez et publiez.' : 'Vérifiez le titre et la catégorie, puis publiez.'}
              </p>
              <Field label="Titre">
                <input className="input" value={f.titre} onChange={maj('titre')} />
              </Field>
              <div className="chips" style={{ marginBottom: 10 }}>
                {CATEGORIES.map(([k, v]) => (
                  <button key={k} type="button" className="chip" aria-pressed={f.categorie === k} onClick={() => setF({ ...f, categorie: k })}>
                    {v}
                  </button>
                ))}
              </div>
              <Field label="En bref (facultatif)">
                <textarea className="input" value={f.description} onChange={maj('description')} style={{ minHeight: 70 }} />
              </Field>
              {['reunion', 'evenement', 'examen', 'calendrier'].includes(f.categorie) && (
                <div className="grid2">
                  <Field label="Date">
                    <input className="input" type="date" value={f.dateEvenement} onChange={maj('dateEvenement')} />
                  </Field>
                  <Field label="Lieu">
                    <input className="input" value={f.lieu} onChange={maj('lieu')} />
                  </Field>
                </div>
              )}
              <Field label="Visible par">
                <select className="input" value={f.audience} onChange={maj('audience')}>
                  <option value="tous">Tout le monde</option>
                  <option value="parents">Les parents</option>
                  <option value="eleves">Les élèves</option>
                  {user.role === 'principal' && <option value="enseignants">Les enseignants</option>}
                </select>
              </Field>
              <div className="actions">
                <button type="button" className="btn" onClick={publier} disabled={Boolean(etat)}>
                  Publier dans le fil
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => (setFichiers([]), setAnalyse(null))}>
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <h2 className="section-title">Documents publiés</h2>
      {liste.data?.length === 0 && <p className="muted">Aucun document pour le moment.</p>}
      {liste.data?.length > 0 && (
        <ul className="liste-eleves">
          {liste.data.map((d) => (
            <li key={d.id} style={{ padding: '10px 12px', gap: 10 }}>
              <span className="nom" style={{ flex: 1, minWidth: 0 }}>
                <b>{d.title}</b>
                <small>
                  {d.categorie || 'Document'} · {new Date(d.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  {d.last_name ? ` · ${d.first_name} ${d.last_name}` : ''}
                </small>
              </span>
              {(user.role === 'principal' || d.mien) && (
                <button type="button" className="btn btn-quiet btn-danger" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => retirer(d.id)}>
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
