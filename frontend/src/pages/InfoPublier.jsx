import { useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'

const reduire = (fichier, max = 1440, q = 0.82) =>
  new Promise((ok) => {
    const img = new Image()
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * r)
      c.height = Math.round(img.height * r)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      c.toBlob((b) => ok(b || fichier), 'image/jpeg', q)
    }
    img.onerror = () => ok(fichier)
    img.src = URL.createObjectURL(fichier)
  })
const versDataUrl = (blob) =>
  new Promise((ok) => {
    const r = new FileReader()
    r.onload = () => ok(r.result)
    r.readAsDataURL(blob)
  })

const GENRES = [
  ['info', 'Information', 'Changement de salle, rappel, consigne…'],
  ['cours', 'Cours supplémentaire', 'Un cours hors emploi du temps'],
  ['evenement', 'Événement', 'Réunion, sortie, cérémonie…'],
]

// Faire passer une information aux familles, avec photos (etablissement et enseignants)
export default function InfoPublier() {
  const { user } = useAuth()
  const classes = useApi(user.role === 'teacher' ? '/api/notes/mes-classes' : '/api/etablissement/classes')
  const champ = useRef(null)
  const [f, setF] = useState({ genre: 'info', classeId: '', titre: '', texte: '', date: '', heure: '', lieu: '' })
  const [photos, setPhotos] = useState([])
  const [etat, setEtat] = useState('')
  const [error, setError] = useState('')
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function publier(e) {
    e.preventDefault()
    setError('')
    try {
      const envoyees = []
      let image = null
      for (const [k, p] of photos.entries()) {
        setEtat(`Envoi de la photo ${k + 1} / ${photos.length}…`)
        const blob = await reduire(p)
        try {
          const s = await api.post('/api/medias/signer', { mime: 'image/jpeg', taille: blob.size })
          const r = await fetch(s.data.envoi, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
          if (!r.ok) throw new Error('L’envoi de la photo a échoué.')
          envoyees.push({ type: 'image', url: s.data.url })
        } catch (err) {
          if (/pas encore activé/.test(err.message) && !image) image = await versDataUrl(await reduire(p, 1000, 0.7))
          else throw err
        }
      }
      setEtat('Publication…')
      await api.post('/api/actualites/infos', { ...f, classeId: f.classeId || null, photos: envoyees, image })
      window.location.hash = '/'
    } catch (err) {
      setError(err.message)
    }
    setEtat('')
  }

  return (
    <form onSubmit={publier}>
      <h1 className="page-title">Faire passer une information</h1>
      <div className="genres">
        {GENRES.map(([k, t, d]) => (
          <button key={k} type="button" className="genre" aria-pressed={f.genre === k} onClick={() => setF({ ...f, genre: k })}>
            <b>{t}</b>
            <span>{d}</span>
          </button>
        ))}
      </div>
      <div className="card">
        <Field label={f.genre === 'cours' ? 'Classe' : 'Classe concernée (facultatif)'}>
          <select className="input" value={f.classeId} onChange={maj('classeId')} required={f.genre === 'cours'}>
            <option value="">{f.genre === 'cours' ? 'Choisir…' : 'Tout l’établissement'}</option>
            {(classes.data || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        {f.genre !== 'info' && (
          <div className="grid2">
            <Field label="Date">
              <input className="input" type="date" value={f.date} onChange={maj('date')} required={f.genre === 'cours'} />
            </Field>
            <Field label="Heure">
              <input className="input" type="time" value={f.heure} onChange={maj('heure')} />
            </Field>
          </div>
        )}
        {f.genre !== 'info' && (
          <Field label="Lieu (salle…)">
            <input className="input" value={f.lieu} onChange={maj('lieu')} />
          </Field>
        )}
        <Field label="Titre (facultatif)">
          <input className="input" value={f.titre} onChange={maj('titre')} />
        </Field>
        <Field label="Le message">
          <textarea className="input" value={f.texte} onChange={maj('texte')} required style={{ minHeight: 100 }} placeholder="Ex. : Cours de rattrapage de mathématiques samedi de 8 h à 10 h en salle 12." />
        </Field>
        <input ref={champ} type="file" hidden multiple accept="image/*" onChange={(e) => (setPhotos((l) => [...l, ...[...(e.target.files || [])]].slice(0, 6)), (e.target.value = ''))} />
        <button type="button" className="btn btn-quiet btn-block" onClick={() => champ.current?.click()}>
          📷 {photos.length ? `${photos.length} photo(s) · en ajouter` : 'Ajouter des photos (facultatif)'}
        </button>
        {photos.length > 0 && (
          <div className="vignettes">
            {photos.map((p, k) => (
              <button key={k} type="button" onClick={() => setPhotos((l) => l.filter((_, j) => j !== k))} aria-label="Retirer la photo">
                <img src={URL.createObjectURL(p)} alt="" />
                <span>×</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Note>{error}</Note>
      <button className="btn btn-block" type="submit" disabled={Boolean(etat)} style={{ marginTop: 12 }}>
        {etat || 'Publier'}
      </button>
    </form>
  )
}
