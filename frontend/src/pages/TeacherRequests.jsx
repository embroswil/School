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

// Un enseignant valide : ses matieres et ses classes (choisies par lui-meme)
function FicheEnseignant({ prof }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 26 }}>👩‍🏫</span>
        <div className="row-main">
          <div className="row-title">
            {prof.first_name} {prof.last_name}
          </div>
          <div className="row-sub" style={{ whiteSpace: 'normal' }}>{prof.matieres || '—'}</div>
        </div>
        {prof.phone && <a href={`tel:${prof.phone}`}>📞</a>}
      </div>
      <p style={{ marginTop: 10, fontSize: 14 }}>
        <b>Classes : </b>
        {prof.classes || <span className="muted">aucune</span>}
      </p>
    </div>
  )
}

export default function TeacherRequests() {
  const [statut, setStatut] = useState('pending')
  const liste = useApi(statut === 'actifs' ? null : `/api/inscriptions/enseignants?status=${statut}`)
  const actifs = useApi(statut === 'actifs' ? '/api/etablissement/enseignants' : null)

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
          {actifs.data?.length > 0 && actifs.data.map((t) => <FicheEnseignant key={t.id} prof={t} />)}
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
            <li>
              <b>Classes :</b> {d.classes || '—'}
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
