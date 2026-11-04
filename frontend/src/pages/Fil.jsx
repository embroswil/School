import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { TYPES } from './Actualites.jsx'
import { LogoEcole } from './OrdrePaiement.jsx'

const API = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '')
const CLE = 'school-fil-ecoles' // choix des etablissements suivis, garde sur le telephone
const lireChoix = () => {
  try {
    return JSON.parse(localStorage.getItem(CLE) || 'null')
  } catch (_) {
    return null
  }
}
const ilYa = (d) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(d).getTime()) / 1000))
  if (s < 3600) return `il y a ${Math.max(1, Math.floor(s / 60))} min`
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`
  if (s < 7 * 86400) return `il y a ${Math.floor(s / 86400)} j`
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}
const dateEvt = (d) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

// Une publication, a la maniere d'un reseau social
function Post({ p }) {
  const [tout, setTout] = useState(false)
  const t = TYPES[p.type] || TYPES.autre
  const long = (p.body || '').length > 280
  return (
    <article className="post">
      <header className="post-tete">
        <LogoEcole id={p.school_id} nom={p.school_name} taille={42} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <b className="post-ecole">{p.school_name}</b>
          <div className="muted" style={{ fontSize: 13 }}>
            {p.school_city ? `${p.school_city} · ` : ''}
            {ilYa(p.created_at)}
          </div>
        </div>
        <span className={`tag ${p.type === 'conseil_discipline' ? 'tag-wait' : ''}`} style={{ fontSize: 12 }}>
          {t.ico} {t.nom}
        </span>
      </header>
      <div className="post-corps">
        <h3>{p.title}</h3>
        {p.event_date && (
          <p className="post-evt">
            🗓️ {dateEvt(p.event_date)}
            {p.event_place ? ` · ${p.event_place}` : ''}
          </p>
        )}
        {p.body && (
          <p className="post-texte">
            {long && !tout ? `${p.body.slice(0, 280)}… ` : p.body}
            {long && (
              <button type="button" onClick={() => setTout(!tout)} className="post-plus">
                {tout ? 'voir moins' : 'voir plus'}
              </button>
            )}
          </p>
        )}
        {p.students?.length > 0 && (
          <ul className="post-eleves">
            {p.students.map((e, i) => (
              <li key={i}>
                <b>{e.nom}</b>
                {e.classe ? ` · ${e.classe}` : ''}
                {e.motif ? ` · ${e.motif}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
      {p.image && <img className="post-image" src={`${API}${p.image}`} alt="" loading="lazy" />}
    </article>
  )
}

// Fil d'actualite : tous les etablissements, les miens, ou ceux que je choisis
export default function Fil() {
  const [mode, setMode] = useState(() => (lireChoix() ? 'choix' : 'tous'))
  const [choix, setChoix] = useState(() => lireChoix() || [])
  const [ouvert, setOuvert] = useState(false)
  const [posts, setPosts] = useState([])
  const [mesEcoles, setMesEcoles] = useState([])
  const [fin, setFin] = useState(false)
  const [busy, setBusy] = useState(false)
  const ecoles = useApi(ouvert ? '/api/familles/ecoles?q=' : null)

  const filtre = mode === 'miens' ? mesEcoles : mode === 'choix' ? choix : []
  const charger = async (avant) => {
    setBusy(true)
    try {
      const qs = new URLSearchParams()
      if (filtre.length) qs.set('ecoles', filtre.join(','))
      if (avant) qs.set('avant', avant)
      const r = await api.get(`/api/actualites/fil?${qs}`)
      setMesEcoles(r.data.mesEcoles)
      setPosts((l) => (avant ? [...l, ...r.data.publications] : r.data.publications))
      setFin(r.data.publications.length < 20)
    } catch (_) {
      setFin(true)
    }
    setBusy(false)
  }
  useEffect(() => {
    charger(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, choix.join(',')])

  const basculer = (id) => {
    const n = choix.includes(id) ? choix.filter((x) => x !== id) : [...choix, id]
    setChoix(n)
    try {
      if (n.length) localStorage.setItem(CLE, JSON.stringify(n))
      else localStorage.removeItem(CLE)
    } catch (_) {}
    setMode(n.length ? 'choix' : 'tous')
  }

  return (
    <section>
      <div className="chips fil-filtres">
        <button type="button" className="chip" aria-pressed={mode === 'tous'} onClick={() => setMode('tous')}>
          Tous les établissements
        </button>
        {mesEcoles.length > 0 && (
          <button type="button" className="chip" aria-pressed={mode === 'miens'} onClick={() => setMode('miens')}>
            Établissement(s) de mes enfants
          </button>
        )}
        <button type="button" className="chip" aria-pressed={mode === 'choix'} onClick={() => setOuvert(!ouvert)}>
          {choix.length ? `Ma sélection (${choix.length})` : 'Choisir…'}
        </button>
      </div>
      {ouvert && (
        <div className="card" style={{ marginBottom: 12 }}>
          <b>Établissements à suivre</b>
          {!ecoles.data && <p className="muted">Chargement…</p>}
          {ecoles.data?.map((e) => (
            <label className="check" key={e.id}>
              <input type="checkbox" checked={choix.includes(e.id)} onChange={() => basculer(e.id)} />
              <span>
                {e.name} <span className="muted">· {e.city}</span>
              </span>
            </label>
          ))}
          <button type="button" className="btn btn-quiet btn-block" style={{ marginTop: 8 }} onClick={() => setOuvert(false)}>
            Fermer
          </button>
        </div>
      )}
      {posts.length === 0 && !busy && <p className="muted" style={{ textAlign: 'center', padding: 30 }}>Aucune actualité pour le moment.</p>}
      {posts.map((p) => (
        <Post key={p.id} p={p} />
      ))}
      {busy && <p className="muted" style={{ textAlign: 'center' }}>Chargement…</p>}
      {!fin && !busy && posts.length > 0 && (
        <button type="button" className="btn btn-quiet btn-block" onClick={() => charger(posts[posts.length - 1].created_at)}>
          Voir plus d’actualités
        </button>
      )}
    </section>
  )
}
