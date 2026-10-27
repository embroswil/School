import { useState } from 'react'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

const n20 = (n) => (n === null || n === undefined ? '—' : Number(n).toFixed(2).replace('.', ','))
const jour = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : '')
const STATUT = { absent: ['Absent(e)', 'var(--danger)'], late: ['Retard', '#c25a00'], excused: ['Absence justifiée', 'var(--muted)'] }

function Notes({ id }) {
  const d = useApi(`/api/suivi/eleves/${id}/notes`)
  const [ouverte, setOuverte] = useState(null)
  if (!d.data) return <p className="muted">Chargement…</p>
  if (!d.data.sequences.length) return <p className="muted">Aucune note publiée pour le moment.</p>
  return d.data.sequences.map((s, i) => {
    const visible = ouverte === null ? i === 0 : ouverte === s.sequence
    return (
      <section key={s.sequence} className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setOuverte(visible ? -1 : s.sequence)}
          style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, padding: 16, border: 0, background: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer', color: 'inherit' }}
        >
          <span className="tag">Séq. {s.sequence}</span>
          <span style={{ flex: 1 }}>
            <b style={{ font: '700 16px/1.3 var(--font-display)' }}>Trimestre {s.trimestre}</b>
            {s.rang && (
              <span className="muted" style={{ display: 'block', fontSize: 13 }}>
                {s.rang === 1 ? '1er' : `${s.rang}e`} sur {s.sur} · moyenne de la classe {n20(s.moyenneClasse)}
              </span>
            )}
          </span>
          <b style={{ font: '800 20px/1 var(--font-display)', color: s.moyenne >= 10 ? 'var(--ok)' : s.moyenne ? 'var(--danger)' : 'var(--muted)' }}>{n20(s.moyenne)}</b>
        </button>
        {visible && (
          <ul style={{ borderTop: '1px solid var(--line)' }}>
            {s.matieres.map((m) => (
              <li key={m.matiere} style={{ padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <b>{m.matiere}</b>
                  <b style={{ color: m.moyenne >= 10 ? 'var(--ok)' : 'var(--danger)' }}>{n20(m.moyenne)}</b>
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  coef. {String(m.coefficient).replace('.0', '')} ·{' '}
                  {m.notes.map((x) => (x.absent ? `${x.titre} : absent` : `${x.titre} : ${n20(x.note)}/${Number(x.bareme)}`)).join(' · ')}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  })
}

function Presences({ id }) {
  const d = useApi(`/api/suivi/eleves/${id}/presences`)
  if (!d.data) return <p className="muted">Chargement…</p>
  return (
    <>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 0 }}>
        <div className="stat">
          <b style={{ color: d.data.absences ? 'var(--danger)' : undefined }}>{d.data.absences}</b>
          <span>absences</span>
        </div>
        <div className="stat">
          <b>{d.data.retards}</b>
          <span>retards</span>
        </div>
        <div className="stat">
          <b>{d.data.justifiees}</b>
          <span>justifiées</span>
        </div>
      </div>
      {d.data.evenements.length === 0 ? (
        <p className="muted" style={{ marginTop: 14 }}>
          Aucune absence ni retard. 👏
        </p>
      ) : (
        <ul className="rows" style={{ marginTop: 14 }}>
          {d.data.evenements.map((e, i) => (
            <li className="row" key={i}>
              <div className="row-main">
                <div className="row-title" style={{ textTransform: 'capitalize' }}>
                  {jour(e.date)}
                </div>
                <div className="row-sub">{e.classe}</div>
              </div>
              <b style={{ color: STATUT[e.status]?.[1] }}>{STATUT[e.status]?.[0] || e.status}</b>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// Suivi d'un eleve (parent, tuteur ou l'eleve lui-meme)
export default function Suivi({ id }) {
  const eleves = useApi('/api/suivi/eleves')
  const [onglet, setOnglet] = useState('notes')
  const e = eleves.data?.find((x) => x.id === id)
  if (eleves.error) return <Note>{eleves.error}</Note>
  if (!eleves.data) return <p className="muted">Chargement…</p>
  if (!e) return <Note>Élève non relié à votre compte.</Note>
  return (
    <>
      <section className="hero-card" style={{ marginTop: 4 }}>
        <span className="badge">{e.classe || 'Classe non précisée'}</span>
        <h2 style={{ marginTop: 8 }}>
          {e.prenom} {e.nom}
        </h2>
        <p>{e.ecole}</p>
      </section>
      <div className="chips" style={{ marginTop: 14 }}>
        <button type="button" className="chip" aria-pressed={onglet === 'notes'} onClick={() => setOnglet('notes')}>
          Notes
        </button>
        <button type="button" className="chip" aria-pressed={onglet === 'presences'} onClick={() => setOnglet('presences')}>
          Absences
        </button>
        <a className="chip" href="#/scolarite">
          Scolarité ›
        </a>
      </div>
      {onglet === 'notes' ? <Notes id={id} /> : <Presences id={id} />}
    </>
  )
}

// Carte resume d'un eleve (accueil)
export function CarteEleve({ e }) {
  return (
    <a className="ecole-carte" href={`#/suivi/${e.id}`}>
      <div className="ecole-tete">
        <span className="avatar" style={{ width: 44, height: 44, borderRadius: 14, fontSize: 16 }}>
          {(e.prenom || '?')[0]}
          {(e.nom || '')[0]}
        </span>
        <div className="row-main">
          <div className="row-title">
            {e.prenom} {e.nom}
          </div>
          <div className="row-sub">
            {e.classe || 'Classe non précisée'}
            {e.lien ? ` · ${e.lien}` : ''}
          </div>
        </div>
        <span className="row-end">›</span>
      </div>
      <div className="ecole-chiffres">
        <span>
          <b style={{ color: e.resultat?.moyenne >= 10 ? 'var(--ok)' : e.resultat ? 'var(--danger)' : undefined }}>{e.resultat ? n20(e.resultat.moyenne) : '—'}</b>
          {e.resultat ? `moyenne séq. ${e.resultat.sequence}` : 'pas encore de notes'}
        </span>
        <span>
          <b>{e.resultat?.rang ? `${e.resultat.rang}e` : '—'}</b>
          {e.resultat?.rang ? `sur ${e.resultat.sur}` : 'rang'}
        </span>
        <span>
          <b style={{ color: e.absencesMois ? 'var(--danger)' : undefined }}>{e.absencesMois}</b>
          absence(s) ce mois
        </span>
      </div>
      {e.dernieresNotes.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 13 }} className="muted">
          Dernières notes :{' '}
          {e.dernieresNotes.map((x) => `${x.matiere} ${x.absent ? 'abs.' : `${n20(x.note)}/${Number(x.bareme)}`}`).join(' · ')}
        </div>
      )}
    </a>
  )
}

// /notes (lien des notifications) : le suivi du premier enfant, ou la liste
export function MesNotes() {
  const eleves = useApi('/api/suivi/eleves')
  if (!eleves.data) return <p className="muted">Chargement…</p>
  if (eleves.data.length === 1) return <Suivi id={eleves.data[0].id} />
  if (!eleves.data.length) return <p className="lede">Aucun élève relié à votre compte.</p>
  return eleves.data.map((e) => <CarteEleve key={e.id} e={e} />)
}
