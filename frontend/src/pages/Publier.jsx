import { useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { Field, Note } from '../ui.jsx'

// Photo reduite (1440 px max, JPEG) avant l'envoi
const reduire = (fichier, max = 1440, qualite = 0.82) =>
  new Promise((ok, ko) => {
    const img = new Image()
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * r)
      c.height = Math.round(img.height * r)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      c.toBlob((b) => (b ? ok(b) : ko(new Error('Image illisible'))), 'image/jpeg', qualite)
    }
    img.onerror = () => ko(new Error('Image illisible'))
    img.src = URL.createObjectURL(fichier)
  })
const versDataUrl = (blob) =>
  new Promise((ok) => {
    const r = new FileReader()
    r.onload = () => ok(r.result)
    r.readAsDataURL(blob)
  })

// Nouvelle publication avec photos et videos (etablissement et enseignants)
export default function Publier() {
  const { user } = useAuth()
  const champ = useRef(null)
  const [fichiers, setFichiers] = useState([]) // { fichier, apercu, type }
  const [f, setF] = useState({ body: '', title: '', type: 'annonce', audience: 'tous', eventDate: '', eventPlace: '' })
  const [etat, setEtat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value })

  function ajouter(e) {
    const liste = [...(e.target.files || [])].slice(0, 10 - fichiers.length)
    e.target.value = ''
    setFichiers((l) => [...l, ...liste.map((x) => ({ fichier: x, apercu: URL.createObjectURL(x), type: x.type.startsWith('video/') ? 'video' : 'image' }))])
  }

  async function publier(e) {
    e.preventDefault()
    setError('')
    if (!fichiers.length && !f.body.trim() && !f.title.trim()) {
      setError('Ajoutez une photo, une vidéo ou un texte.')
      return
    }
    setBusy(true)
    try {
      const medias = []
      let imageSecours = null
      for (const [k, x] of fichiers.entries()) {
        setEtat(`Envoi ${k + 1} / ${fichiers.length}…`)
        const blob = x.type === 'image' ? await reduire(x.fichier) : x.fichier
        const mime = x.type === 'image' ? 'image/jpeg' : x.fichier.type || 'video/mp4'
        try {
          const s = await api.post('/api/medias/signer', { mime, taille: blob.size })
          const r = await fetch(s.data.envoi, { method: 'PUT', headers: { 'Content-Type': mime }, body: blob })
          if (!r.ok) throw new Error('L’envoi du fichier a échoué. Vérifiez la connexion et réessayez.')
          medias.push({ type: s.data.type, url: s.data.url })
        } catch (err) {
          // Stockage pas encore active : une seule photo est possible (gardee dans la publication)
          if (x.type === 'image' && fichiers.length === 1 && /pas encore activé/.test(err.message)) imageSecours = await versDataUrl(await reduire(x.fichier, 1000, 0.7))
          else throw err
        }
      }
      setEtat('Publication…')
      await api.post('/api/actualites', {
        ...f,
        eventDate: f.type === 'evenement' && f.eventDate ? f.eventDate : null,
        medias,
        image: imageSecours,
      })
      window.location.hash = '/'
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
    setEtat('')
  }

  return (
    <form onSubmit={publier}>
      <input ref={champ} type="file" hidden multiple accept="image/*,video/*" onChange={ajouter} />
      {fichiers.length === 0 ? (
        <button type="button" className="card" onClick={() => champ.current?.click()} style={{ width: '100%', aspectRatio: '1', display: 'grid', placeItems: 'center', border: '2px dashed var(--line)', background: '#fff', cursor: 'pointer' }}>
          <span>
            <span style={{ fontSize: 48, display: 'block' }}>📷</span>
            <b>Ajouter des photos ou des vidéos</b>
            <span className="muted" style={{ display: 'block', fontSize: 14 }}>
              Jusqu’à 10 · vidéo de 50 Mo maximum
            </span>
          </span>
        </button>
      ) : (
        <>
          <div className="carrousel-piste" style={{ borderRadius: 14, background: '#000' }}>
            {fichiers.map((x, k) =>
              x.type === 'video' ? <video key={k} src={x.apercu} controls playsInline style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', flex: 'none' }} /> : <img key={k} src={x.apercu} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', flex: 'none' }} />,
            )}
          </div>
          <div className="actions" style={{ margin: '8px 0 12px' }}>
            {fichiers.length < 10 && (
              <button type="button" className="btn btn-quiet" style={{ padding: '8px 12px', fontSize: 14 }} onClick={() => champ.current?.click()}>
                + Ajouter ({fichiers.length}/10)
              </button>
            )}
            <button type="button" className="btn btn-quiet btn-danger" style={{ padding: '8px 12px', fontSize: 14 }} onClick={() => setFichiers([])}>
              Tout retirer
            </button>
          </div>
        </>
      )}
      <div className="card" style={{ marginTop: 12 }}>
        <Field label="Légende">
          <textarea className="input" placeholder="Écrivez une légende…" value={f.body} onChange={maj('body')} style={{ minHeight: 90 }} />
        </Field>
        <Field label="Titre (facultatif)">
          <input className="input" value={f.title} onChange={maj('title')} />
        </Field>
        <div className="grid2">
          <Field label="Type">
            <select className="input" value={f.type} onChange={maj('type')}>
              <option value="annonce">Annonce</option>
              <option value="evenement">Événement</option>
              <option value="resultats">Résultats</option>
              <option value="autre">Autre</option>
            </select>
          </Field>
          <Field label="Visible par">
            <select className="input" value={f.audience} onChange={maj('audience')}>
              <option value="tous">Tout le monde</option>
              <option value="parents">Les parents</option>
              <option value="eleves">Les élèves</option>
              {user.role === 'principal' && <option value="enseignants">Les enseignants</option>}
            </select>
          </Field>
        </div>
        {f.type === 'evenement' && (
          <div className="grid2">
            <Field label="Date et heure">
              <input className="input" type="datetime-local" value={f.eventDate} onChange={maj('eventDate')} />
            </Field>
            <Field label="Lieu">
              <input className="input" value={f.eventPlace} onChange={maj('eventPlace')} />
            </Field>
          </div>
        )}
      </div>
      <Note>{error}</Note>
      <button className="btn btn-block" type="submit" disabled={busy} style={{ marginTop: 12 }}>
        {busy ? etat || 'Publication…' : 'Partager'}
      </button>
    </form>
  )
}
