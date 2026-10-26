import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

const FILTRES = [
  ['actifs', 'Enseignants'],
  ['pending', 'À valider'],
  ['approved', 'Validés'],
  ['rejected', 'Refusés'],
]

// Affectation d'un enseignant : une matiere, une ou plusieurs classes
function Affectation({ prof, matieres, classes, affectations, onChange }) {
  const [ouvert, setOuvert] = useState(false)
  const [matiere, setMatiere] = useState('')
  const [nouvelle, setNouvelle] = useState('')
  const [choix, setChoix] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const siennes = affectations.filter((a) => a.teacher_id === prof.id)

  async function enregistrer() {
    setError('')
    setBusy(true)
    try {
      let subjectId = Number(matiere)
      if (matiere === 'autre') {
        const r = await api.post('/api/etablissement/matieres', { nom: nouvelle })
        subjectId = r.data.id
      }
      await api.post('/api/etablissement/affectations', { teacherId: prof.id, subjectId, classIds: choix })
      setOuvert(false)
      setChoix([])
      setMatiere('')
      setNouvelle('')
      onChange()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  async function retirer(id) {
    await api.delete(`/api/etablissement/affectations/${id}`)
    onChange()
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 26 }}>👩‍🏫</span>
        <div className="row-main">
          <div className="row-title">
            {prof.first_name} {prof.last_name}
          </div>
          <div className="row-sub">{prof.matieres || prof.email}</div>
        </div>
        {prof.phone && <a href={`tel:${prof.phone}`}>📞</a>}
      </div>
      {siennes.length > 0 && (
        <div className="chips" style={{ marginTop: 12, marginBottom: 0 }}>
          {siennes.map((a) => (
            <span key={a.id} className="tag" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '6px 10px' }}>
              {a.matiere} · {a.classe}
              <button type="button" aria-label="Retirer" onClick={() => retirer(a.id)} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 800 }}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {!ouvert ? (
        <button type="button" className="btn btn-quiet" style={{ marginTop: 12, padding: '10px 14px', fontSize: 14 }} onClick={() => setOuvert(true)}>
          + Affecter à des classes
        </button>
      ) : (
        <div style={{ marginTop: 12 }}>
          <label className="field">
            <span className="field-label">Matière</span>
            <select className="input" value={matiere} onChange={(e) => setMatiere(e.target.value)}>
              <option value="">Choisir la matière</option>
              {matieres.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
              <option value="autre">Autre matière…</option>
            </select>
          </label>
          {matiere === 'autre' && (
            <label className="field">
              <span className="field-label">Nom de la matière</span>
              <input className="input" value={nouvelle} onChange={(e) => setNouvelle(e.target.value)} />
            </label>
          )}
          <span className="field-label">Classes</span>
          {classes.length === 0 ? (
            <p className="muted" style={{ fontSize: 14 }}>
              Créez d’abord vos <a href="#/classes">classes</a>.
            </p>
          ) : (
            <div className="chips">
              {classes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="chip"
                  aria-pressed={choix.includes(c.id)}
                  onClick={() => setChoix((l) => (l.includes(c.id) ? l.filter((x) => x !== c.id) : [...l, c.id]))}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <Note>{error}</Note>
          <div className="actions">
            <button type="button" className="btn" disabled={busy || !matiere || !choix.length} onClick={enregistrer}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setOuvert(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TeacherRequests() {
  const [statut, setStatut] = useState('pending')
  const liste = useApi(statut === 'actifs' ? null : `/api/inscriptions/enseignants?status=${statut}`)
  const actifs = useApi(statut === 'actifs' ? '/api/etablissement/enseignants' : null)
  const matieres = useApi(statut === 'actifs' ? '/api/etablissement/matieres' : null)
  const classesAnnee = useApi(statut === 'actifs' ? '/api/etablissement/classes' : null)
  const affectations = useApi(statut === 'actifs' ? '/api/etablissement/affectations' : null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)

  async function decider(id, action) {
    let motif
    if (action === 'refuser') {
      motif = window.prompt('Motif du refus (facultatif) :') ?? undefined
    }
    setError('')
    setBusy(id)
    try {
      await api.post(`/api/inscriptions/enseignants/${id}/${action}`, motif ? { motif } : {})
      liste.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(null)
  }

  return (
    <>
      <h1 className="page-title">Enseignants</h1>
      <p className="lede">Vérifiez les informations des nouveaux enseignants avant de leur ouvrir l’accès.</p>
      <div className="chips">
        {FILTRES.map(([k, v]) => (
          <button key={k} type="button" className="chip" aria-pressed={statut === k} onClick={() => setStatut(k)}>
            {v}
          </button>
        ))}
      </div>
      <Note>{error}</Note>
      {statut === 'actifs' && (
        <>
          {actifs.loading && <p className="muted">Chargement…</p>}
          {actifs.data?.length === 0 && <p className="muted">Aucun enseignant validé pour le moment.</p>}
          {actifs.data?.length > 0 &&
            actifs.data.map((t) => (
              <Affectation
                key={t.id}
                prof={t}
                matieres={matieres.data || []}
                classes={classesAnnee.data || []}
                affectations={affectations.data || []}
                onChange={() => affectations.reload()}
              />
            ))}
        </>
      )}
      {liste.loading && <p className="muted">Chargement…</p>}
      {liste.data?.length === 0 && <p className="muted">Aucune demande.</p>}
      {liste.data?.map((d) => (
        <div className="card" key={d.id}>
          <div className="row-title" style={{ fontSize: 17 }}>
            👩‍🏫 {d.first_name} {d.last_name}
          </div>
          <div className="row-sub">
            {d.email}
            {d.phone ? ` · ${d.phone}` : ''}
          </div>
          <ul style={{ marginTop: 10, fontSize: 15, display: 'grid', gap: 4 }}>
            <li>
              <b>Matières :</b> {d.subjects || '—'}
            </li>
            {d.qualification && (
              <li>
                <b>Diplôme :</b> {d.qualification}
              </li>
            )}
            {d.experience && (
              <li>
                <b>Expérience :</b> {d.experience}
              </li>
            )}
            {d.message && <li className="muted">« {d.message} »</li>}
            {d.decision_reason && (
              <li className="muted">
                <b>Motif du refus :</b> {d.decision_reason}
              </li>
            )}
          </ul>
          {d.status === 'pending' && (
            <div className="actions">
              <button type="button" className="btn btn-ok" disabled={busy === d.id} onClick={() => decider(d.id, 'valider')}>
                ✓ Valider
              </button>
              <button type="button" className="btn btn-quiet btn-danger" disabled={busy === d.id} onClick={() => decider(d.id, 'refuser')}>
                Refuser
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  )
}
