import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { TYPES } from './Actualites.jsx'
import { LogoEcole } from './OrdrePaiement.jsx'

const API = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '')
// Couleur de chaque type d'information (liseré et etiquette)
const COULEURS = { annonce: '#2f6bff', evenement: '#7aa5ff', resultats: '#ffffff', conseil_discipline: '#ff4d4d', autre: '#98a2b3' }
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const heureEvt = (d) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

// Photos et videos d'une information : a faire defiler, avec un compteur
function Medias({ medias }) {
  const [i, setI] = useState(0)
  return (
    <div className="info-medias">
      <div className="piste" onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {medias.map((m, k) => (m.type === 'video' ? <video key={k} src={m.url} controls playsInline preload="metadata" /> : <img key={k} src={m.url} alt="" loading="lazy" />))}
      </div>
      {medias.length > 1 && (
        <span className="compteur">
          {i + 1}/{medias.length}
        </span>
      )}
    </div>
  )
}

// Une information de l'etablissement : apercu court, la fiche entiere s'ouvre au toucher
export function Info({ p, complet = false }) {
  const t = TYPES[p.type] || TYPES.autre
  const d = new Date(p.created_at)
  const medias = [...(p.medias || []), ...(p.image ? [{ type: 'image', url: `${API}${p.image}` }] : [])]
  const long = !complet && (p.body || '').length > 200
  const eleves = p.students || []
  const montres = complet ? eleves : eleves.slice(0, 3)
  const tronque = long || (!complet && eleves.length > 3)
  const ouvrir = (e) => {
    if (complet || e.target.closest('video, .piste')) return
    window.location.hash = `/infos/${p.id}`
  }
  return (
    <article className={`info ${complet ? '' : 'cliquable'}`} style={{ '--couleur': COULEURS[p.type] || COULEURS.autre }} onClick={ouvrir}>
      <div className="info-date">
        <b>{d.getDate()}</b>
        <span>{MOIS[d.getMonth()]}</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="info-ecole">
          <LogoEcole id={p.school_id} nom={p.school_name} taille={22} />
          <b>{p.school_name}</b>
          {p.enseignant ? <span>· {p.enseignant}</span> : null}
        </div>
        <span className="info-type">{t.nom}</span>
        {p.title && <h3>{p.title}</h3>}
        {p.body && <p className="info-texte">{long ? `${p.body.slice(0, 200)}…` : p.body}</p>}
        {p.event_date && (
          <div className="info-evt">
            <span style={{ fontSize: 20 }}>🗓️</span>
            <span>
              <b style={{ textTransform: 'capitalize' }}>{heureEvt(p.event_date)}</b>
              {p.event_place ? <span className="muted"> · {p.event_place}</span> : null}
            </span>
          </div>
        )}
        {montres.length > 0 && (
          <ul className="info-eleves">
            {montres.map((e, i) => (
              <li key={i}>
                <b>{e.nom}</b>
                {e.classe ? ` · ${e.classe}` : ''}
                {e.motif ? ` · ${e.motif}` : ''}
              </li>
            ))}
            {!complet && eleves.length > 3 && <li className="muted">+ {eleves.length - 3} autre(s)…</li>}
          </ul>
        )}
        {tronque && <span className="info-voir">Voir tout ›</span>}
      </div>
      {medias.length > 0 && <Medias medias={medias} />}
    </article>
  )
}

// Fil d'informations de tous les etablissements, filtrable par etablissement
export default function Fil({ enfants, actions }) {
  const [ecoles, setEcoles] = useState([])
  const [choisie, setChoisie] = useState(null)
  const [posts, setPosts] = useState([])
  const [fin, setFin] = useState(false)
  const [busy, setBusy] = useState(false)
  const req = useRef(0)

  useEffect(() => {
    api.get('/api/familles/ecoles?q=').then((r) => setEcoles(r.data.slice(0, 30)), () => {})
  }, [])
  const charger = async (avant) => {
    const n = ++req.current
    setBusy(true)
    try {
      const qs = new URLSearchParams()
      if (choisie) qs.set('ecoles', String(choisie))
      if (avant) qs.set('avant', avant)
      const r = await api.get(`/api/actualites/fil?${qs}`)
      if (n !== req.current) return
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
  }, [choisie])

  return (
    <section>
      {(enfants?.length > 0 || actions) && (
        <div className="enfants-raccourcis">
          {enfants?.map((e) => (
            <a key={e.id} className="enfant-carte" href={`#/suivi/${e.id}`}>
              <span className="avatar">
                {(e.prenom || '?')[0]}
                {(e.nom || '')[0]}
              </span>
              <span>
                <b style={{ display: 'block', fontSize: 14 }}>{e.prenom}</b>
                <span className="muted" style={{ fontSize: 12 }}>
                  {e.classe || '—'}
                  {e.absencesMois ? ` · ${e.absencesMois} abs.` : ''}
                </span>
              </span>
            </a>
          ))}
          {actions}
        </div>
      )}
      <div className="filtres-ecoles">
        <button type="button" className="filtre-ecole" aria-pressed={!choisie} onClick={() => setChoisie(null)} style={{ paddingLeft: 12 }}>
          Toutes les infos
        </button>
        {ecoles.map((s) => (
          <button key={s.id} type="button" className="filtre-ecole" aria-pressed={choisie === s.id} onClick={() => setChoisie(choisie === s.id ? null : s.id)}>
            <LogoEcole id={s.id} nom={s.name} taille={26} />
            {s.name}
          </button>
        ))}
      </div>
      {posts.length === 0 && !busy && <p className="muted" style={{ textAlign: 'center', padding: 30 }}>Aucune information pour le moment.</p>}
      {posts.map((p) => (
        <Info key={p.id} p={p} />
      ))}
      {busy && <p className="muted" style={{ textAlign: 'center', padding: 12 }}>Chargement…</p>}
      {!fin && !busy && posts.length > 0 && (
        <button type="button" className="btn btn-quiet btn-block" onClick={() => charger(posts[posts.length - 1].created_at)}>
          Informations plus anciennes
        </button>
      )}
    </section>
  )
}
