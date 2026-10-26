import { useRef, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'

export const TYPES = {
  annonce: { ico: '📣', nom: 'Annonce' },
  evenement: { ico: '📅', nom: 'Événement' },
  conseil_discipline: { ico: '⚖️', nom: 'Conseil de discipline' },
  resultats: { ico: '🏆', nom: 'Résultats' },
  autre: { ico: 'ℹ️', nom: 'Information' },
}
const PUBLICS = { tous: 'Tout le monde', parents: 'Parents', eleves: 'Élèves', enseignants: 'Enseignants' }

const date = (d, heure = false) =>
  new Date(d).toLocaleString('fr-FR', {
    weekday: heure ? 'long' : undefined,
    day: 'numeric',
    month: 'long',
    ...(heure ? { hour: '2-digit', minute: '2-digit' } : {}),
  })

const reduirePhoto = (fichier) =>
  new Promise((ok, ko) => {
    const img = new Image()
    img.onload = () => {
      const echelle = Math.min(1, 900 / img.width)
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * echelle)
      c.height = Math.round(img.height * echelle)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      ok(c.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => ko(new Error('Image illisible'))
    img.src = URL.createObjectURL(fichier)
  })

// Une publication du fil
export function Publication({ p, onDelete }) {
  const t = TYPES[p.type] || TYPES.autre
  return (
    <article className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {p.image && <img src={p.image} alt="" style={{ display: 'block', width: '100%', maxHeight: 260, objectFit: 'cover' }} />}
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`tag ${p.type === 'conseil_discipline' ? 'tag-wait' : ''}`}>
            {t.ico} {t.nom}
          </span>
          {p.pinned && <span className="tag tag-now">📌 Épinglé</span>}
          <span className="muted" style={{ fontSize: 13 }}>
            {date(p.created_at)}
          </span>
        </div>
        <h3 style={{ font: '700 18px/1.3 var(--font-display)', marginTop: 10 }}>{p.title}</h3>
        {p.event_date && (
          <p style={{ marginTop: 6, fontWeight: 700, color: 'var(--primary)' }}>
            🗓️ {date(p.event_date, true)}
            {p.event_place ? ` · ${p.event_place}` : ''}
          </p>
        )}
        {p.body && <p style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{p.body}</p>}
        {p.students?.length > 0 && (
          <ul className="rows" style={{ marginTop: 12, boxShadow: 'none' }}>
            {p.students.map((e, i) => (
              <li className="row" key={i} style={{ padding: '10px 12px' }}>
                <div className="row-main">
                  <div className="row-title">{e.nom}</div>
                  {(e.classe || e.motif) && (
                    <div className="row-sub" style={{ whiteSpace: 'normal' }}>
                      {e.classe}
                      {e.classe && e.motif ? ' · ' : ''}
                      {e.motif}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {onDelete && (
          <div className="actions" style={{ marginTop: 12 }}>
            <span className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>
              Visible par : {PUBLICS[p.audience]}
            </span>
            <button type="button" className="btn btn-quiet btn-danger" style={{ padding: '8px 12px', fontSize: 14 }} onClick={() => onDelete(p.id)}>
              Supprimer
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

const vide = { type: 'annonce', title: '', body: '', eventDate: '', eventPlace: '', audience: 'tous', pinned: false }
const eleveVide = { nom: '', classe: '', motif: '' }

function Formulaire({ onDone }) {
  const [f, setF] = useState(vide)
  const [eleves, setEleves] = useState([{ ...eleveVide }])
  const [image, setImage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const champ = useRef(null)
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const majEleve = (i, k) => (e) => setEleves((l) => l.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))

  async function publier(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.post('/api/actualites', {
        ...f,
        eventDate: f.type === 'evenement' && f.eventDate ? f.eventDate : undefined,
        students: f.type === 'conseil_discipline' ? eleves : undefined,
        image: image || undefined,
      })
      setF(vide)
      setEleves([{ ...eleveVide }])
      setImage('')
      onDone()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <form className="card" onSubmit={publier} style={{ marginBottom: 16 }}>
      <div className="chips">
        {Object.entries(TYPES).map(([k, t]) => (
          <button key={k} type="button" className="chip" aria-pressed={f.type === k} onClick={() => setF((x) => ({ ...x, type: k }))}>
            {t.ico} {t.nom}
          </button>
        ))}
      </div>
      <Field label="Titre">
        <input
          className="input"
          placeholder={f.type === 'conseil_discipline' ? 'ex. Conseil de discipline du 12 novembre' : 'ex. Réunion des parents d’élèves'}
          value={f.title}
          onChange={maj('title')}
          required
        />
      </Field>
      {f.type === 'evenement' && (
        <div className="grid2">
          <Field label="Date et heure">
            <input className="input" type="datetime-local" value={f.eventDate} onChange={maj('eventDate')} />
          </Field>
          <Field label="Lieu">
            <input className="input" placeholder="ex. Salle polyvalente" value={f.eventPlace} onChange={maj('eventPlace')} />
          </Field>
        </div>
      )}
      <Field label="Texte">
        <textarea className="input" style={{ minHeight: 110 }} value={f.body} onChange={maj('body')} />
      </Field>
      {f.type === 'conseil_discipline' && (
        <>
          <p className="field-label">Élèves convoqués</p>
          {eleves.map((el, i) => (
            <div key={i} style={{ borderTop: i ? '1px solid var(--line)' : 0, paddingTop: i ? 12 : 0 }}>
              <div className="grid2">
                <Field label="Nom de l’élève">
                  <input className="input" value={el.nom} onChange={majEleve(i, 'nom')} />
                </Field>
                <Field label="Classe">
                  <input className="input" value={el.classe} onChange={majEleve(i, 'classe')} />
                </Field>
              </div>
              <Field label="Motif">
                <input className="input" value={el.motif} onChange={majEleve(i, 'motif')} />
              </Field>
            </div>
          ))}
          <button type="button" className="btn btn-quiet" style={{ marginBottom: 14 }} onClick={() => setEleves((l) => [...l, { ...eleveVide }])}>
            + Ajouter un élève
          </button>
        </>
      )}
      <Field label="Visible par">
        <select className="input" value={f.audience} onChange={maj('audience')}>
          {Object.entries(PUBLICS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <label className="check">
        <input type="checkbox" checked={f.pinned} onChange={maj('pinned')} /> Épingler en haut du fil
      </label>
      <div className="actions" style={{ marginBottom: 10 }}>
        <button type="button" className="btn btn-quiet" onClick={() => champ.current?.click()}>
          📷 {image ? 'Changer l’image' : 'Ajouter une image'}
        </button>
        {image && (
          <button type="button" className="btn btn-quiet btn-danger" onClick={() => setImage('')}>
            Retirer
          </button>
        )}
        <input
          ref={champ}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const fic = e.target.files?.[0]
            if (fic) setImage(await reduirePhoto(fic))
          }}
        />
      </div>
      {image && <img src={image} alt="" style={{ width: '100%', borderRadius: 14, marginBottom: 10 }} />}
      <Note>{error}</Note>
      <button className="btn btn-block" type="submit" disabled={busy}>
        {busy ? 'Publication…' : 'Publier'}
      </button>
    </form>
  )
}

export default function Actualites() {
  const { user } = useAuth()
  const etablissement = user.role === 'principal'
  const fil = useApi('/api/actualites')
  const [ouvert, setOuvert] = useState(false)

  async function supprimer(id) {
    if (!window.confirm('Supprimer cette publication ?')) return
    await api.delete(`/api/actualites/${id}`)
    fil.reload()
  }

  return (
    <>
      <h1 className="page-title">Actualités</h1>
      <p className="lede">
        {etablissement
          ? 'Publiez les annonces, événements, conseils de discipline et résultats. Les personnes concernées sont notifiées.'
          : `Les informations de ${user.schoolName || 'votre établissement'}.`}
      </p>
      {etablissement &&
        (ouvert ? (
          <Formulaire
            onDone={() => {
              setOuvert(false)
              fil.reload()
            }}
          />
        ) : (
          <button type="button" className="btn btn-block" style={{ marginBottom: 16 }} onClick={() => setOuvert(true)}>
            ✏️ Nouvelle publication
          </button>
        ))}
      {fil.loading && <p className="muted">Chargement…</p>}
      {fil.error && <Note>{fil.error}</Note>}
      {fil.data?.length === 0 && <p className="muted">Aucune publication pour le moment.</p>}
      {fil.data?.map((p) => (
        <Publication key={p.id} p={p} onDelete={etablissement ? supprimer : undefined} />
      ))}
    </>
  )
}
