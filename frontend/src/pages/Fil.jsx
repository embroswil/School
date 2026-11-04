import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { TYPES } from './Actualites.jsx'
import { LogoEcole } from './OrdrePaiement.jsx'

const API = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '')
const ilYa = (d) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(d).getTime()) / 1000))
  if (s < 3600) return `il y a ${Math.max(1, Math.floor(s / 60))} min`
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`
  if (s < 7 * 86400) return `il y a ${Math.floor(s / 86400)} j`
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}
const dateEvt = (d) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

const Coeur = ({ plein }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill={plein ? '#ed4956' : 'none'} stroke={plein ? '#ed4956' : 'currentColor'} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.6 3 5 6.6 5c2 0 3.6 1.1 4.4 2.6l1 1.6 1-1.6C13.8 6.1 15.4 5 17.4 5 21 5 23.1 8.6 21.6 11.8 19.5 16.4 12 21 12 21z" />
  </svg>
)
const Partager = () => (
  <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 3 9.2 10.1M22 3l-6.8 18-3.6-8.3L3 9.6 22 3z" />
  </svg>
)

// Photos et videos d'une publication, a faire defiler
function Carrousel({ medias, onDoubleTap }) {
  const [i, setI] = useState(0)
  const piste = useRef(null)
  const dernier = useRef(0)
  return (
    <div
      className="carrousel"
      onClick={() => {
        const t = Date.now()
        if (t - dernier.current < 300) onDoubleTap()
        dernier.current = t
      }}
    >
      <div className="carrousel-piste" ref={piste} onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {medias.map((m, k) =>
          m.type === 'video' ? (
            <video key={k} src={m.url} controls playsInline preload="metadata" />
          ) : (
            <img key={k} src={m.url} alt="" loading="lazy" />
          ),
        )}
      </div>
      {medias.length > 1 && (
        <div className="carrousel-points" style={{ background: '#fff' }}>
          {medias.map((_, k) => (
            <span key={k} className={k === i ? 'on' : ''} />
          ))}
        </div>
      )}
    </div>
  )
}

// Une publication, a la maniere d'Instagram
function Post({ p }) {
  const [tout, setTout] = useState(false)
  const [aime, setAime] = useState(Boolean(p.aime))
  const [jaime, setJaime] = useState(p.jaime || 0)
  const [anim, setAnim] = useState(false)
  const t = TYPES[p.type] || TYPES.autre
  const medias = [...(p.medias || []), ...(p.image ? [{ type: 'image', url: `${API}${p.image}` }] : [])]
  const texte = [p.title, p.body].filter(Boolean).join(' — ')
  const long = texte.length > 160

  async function aimer(forcer) {
    if (forcer && aime) return
    setAime(!aime)
    setJaime((n) => n + (aime ? -1 : 1))
    setAnim(true)
    setTimeout(() => setAnim(false), 400)
    try {
      const r = await api.post(`/api/actualites/${p.id}/jaime`)
      setAime(r.data.aime)
      setJaime(r.data.jaime)
    } catch (_) {}
  }

  return (
    <article className="post">
      <header className="post-tete" style={{ paddingBottom: 10 }}>
        <LogoEcole id={p.school_id} nom={p.school_name} taille={36} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <b className="post-ecole" style={{ fontSize: 14 }}>{p.school_name}</b>
          <div className="muted" style={{ fontSize: 12 }}>
            {p.enseignant ? `${p.enseignant} · ` : ''}
            {p.school_city || ''}
          </div>
        </div>
        <span className="tag" style={{ fontSize: 11 }}>
          {t.ico} {t.nom}
        </span>
      </header>
      {medias.length > 0 && <Carrousel medias={medias} onDoubleTap={() => aimer(true)} />}
      <div className="post-actions">
        <button type="button" onClick={() => aimer(false)} aria-label={aime ? 'Je n’aime plus' : 'J’aime'} className={anim ? 'coeur-anim' : ''}>
          <Coeur plein={aime} />
        </button>
        <button
          type="button"
          aria-label="Partager"
          onClick={() => navigator.share?.({ title: p.title || p.school_name, text: texte.slice(0, 200), url: window.location.origin }).catch(() => {})}
        >
          <Partager />
        </button>
      </div>
      {jaime > 0 && <div className="post-jaime">{jaime} J’aime</div>}
      {p.event_date && (
        <p className="post-legende" style={{ color: 'var(--primary)', fontWeight: 700, textTransform: 'capitalize' }}>
          🗓️ {dateEvt(p.event_date)}
          {p.event_place ? ` · ${p.event_place}` : ''}
        </p>
      )}
      {texte && (
        <p className="post-legende">
          <b>{p.school_name}</b>
          {long && !tout ? `${texte.slice(0, 160)}… ` : texte}
          {long && (
            <button type="button" onClick={() => setTout(!tout)} className="post-plus">
              {tout ? ' moins' : 'plus'}
            </button>
          )}
        </p>
      )}
      {p.students?.length > 0 && (
        <ul className="post-eleves" style={{ margin: '8px 14px 0' }}>
          {p.students.map((e, i) => (
            <li key={i}>
              <b>{e.nom}</b>
              {e.classe ? ` · ${e.classe}` : ''}
              {e.motif ? ` · ${e.motif}` : ''}
            </li>
          ))}
        </ul>
      )}
      <div className="post-date">{ilYa(p.created_at)}</div>
    </article>
  )
}

function ImageEcole({ id, nom }) {
  const [ok, setOk] = useState(true)
  return ok ? <img src={`${API}/api/actualites/ecoles/${id}/photo`} alt="" onError={() => setOk(false)} /> : <span>{(nom || '?')[0]}</span>
}

// Rangee de « stories » : enfants (parent), puis les etablissements a suivre
function Stories({ enfants, ecoles, choisie, onChoisir, actions }) {
  return (
    <div className="stories">
      {actions}
      {enfants?.map((e) => (
        <a key={`e${e.id}`} className="story" href={`#/suivi/${e.id}`}>
          <span className="story-anneau">
            <span>
              {(e.prenom || '?')[0]}
              {(e.nom || '')[0]}
            </span>
          </span>
          <b>{e.prenom}</b>
        </a>
      ))}
      {ecoles.map((s) => (
        <button key={`s${s.id}`} type="button" className="story" onClick={() => onChoisir(choisie === s.id ? null : s.id)}>
          <span className={`story-anneau ${choisie && choisie !== s.id ? 'gris' : ''}`}>
            <ImageEcole id={s.id} nom={s.name} />
          </span>
          <b style={{ fontWeight: choisie === s.id ? 800 : 400 }}>{s.name.replace(/^Lycée |^Collège |^École /, '')}</b>
        </button>
      ))}
    </div>
  )
}

// Fil d'actualite de tous les etablissements (ou d'un seul, en touchant sa story)
export default function Fil({ enfants, actions }) {
  const [ecoles, setEcoles] = useState([])
  const [choisie, setChoisie] = useState(null)
  const [posts, setPosts] = useState([])
  const [fin, setFin] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/api/familles/ecoles?q=').then((r) => setEcoles(r.data.slice(0, 20)), () => {})
  }, [])
  const charger = async (avant) => {
    setBusy(true)
    try {
      const qs = new URLSearchParams()
      if (choisie) qs.set('ecoles', String(choisie))
      if (avant) qs.set('avant', avant)
      const r = await api.get(`/api/actualites/fil?${qs}`)
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
      <Stories enfants={enfants} ecoles={ecoles} choisie={choisie} onChoisir={setChoisie} actions={actions} />
      {posts.length === 0 && !busy && <p className="muted" style={{ textAlign: 'center', padding: 30 }}>Aucune publication pour le moment.</p>}
      {posts.map((p) => (
        <Post key={p.id} p={p} />
      ))}
      {busy && <p className="muted" style={{ textAlign: 'center', padding: 12 }}>Chargement…</p>}
      {!fin && !busy && posts.length > 0 && (
        <button type="button" className="btn btn-quiet btn-block" onClick={() => charger(posts[posts.length - 1].created_at)}>
          Voir plus de publications
        </button>
      )}
    </section>
  )
}
