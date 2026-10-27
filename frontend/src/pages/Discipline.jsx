import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'

export const TYPES_SANCTION = {
  observation: 'Observation',
  avertissement: 'Avertissement',
  blame: 'Blâme',
  retenue: 'Retenue',
  convocation_parents: 'Convocation des parents',
  exclusion_temporaire: 'Exclusion temporaire',
  exclusion_definitive: 'Exclusion définitive',
}
const jour = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
const grave = (t) => ['blame', 'exclusion_temporaire', 'exclusion_definitive'].includes(t)

// Dossier de discipline d'un eleve ; « gestion » : ajout et retrait (administration)
export default function Discipline({ eleveId, gestion = false }) {
  const d = useApi(`/api/vie-scolaire/sanctions/eleves/${eleveId}`)
  const [ouvert, setOuvert] = useState(false)
  const [f, setF] = useState({ type: 'avertissement', motif: '', date: new Date().toISOString().slice(0, 10), dureeJours: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function ajouter(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.post('/api/vie-scolaire/sanctions', { ...f, studentId: eleveId })
      setOuvert(false)
      setF((x) => ({ ...x, motif: '', dureeJours: '' }))
      d.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <>
      {gestion &&
        (ouvert ? (
          <form className="card" onSubmit={ajouter} style={{ marginBottom: 12 }}>
            <Field label="Type">
              <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                {Object.entries(TYPES_SANCTION).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Motif">
              <textarea className="input" value={f.motif} onChange={(e) => setF({ ...f, motif: e.target.value })} required />
            </Field>
            <div className="grid2">
              <Field label="Date des faits">
                <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
              </Field>
              {['exclusion_temporaire', 'retenue'].includes(f.type) && (
                <Field label="Durée (jours)">
                  <input className="input" inputMode="numeric" value={f.dureeJours} onChange={(e) => setF({ ...f, dureeJours: e.target.value })} />
                </Field>
              )}
            </div>
            <Note>{error}</Note>
            <div className="actions">
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Enregistrement…' : 'Enregistrer (les parents sont prévenus)'}
              </button>
              <button className="btn btn-quiet" type="button" onClick={() => setOuvert(false)}>
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn-quiet btn-block" style={{ marginBottom: 12 }} onClick={() => setOuvert(true)}>
            + Signaler une sanction ou une observation
          </button>
        ))}
      {d.data?.length === 0 && <p className="muted">Aucune sanction. 👏</p>}
      {d.data?.length > 0 && (
        <ul className="rows">
          {d.data.map((s) => (
            <li className="row" key={s.id} style={{ alignItems: 'flex-start' }}>
              <div className="row-main">
                <div className="row-title" style={{ color: grave(s.type) ? 'var(--danger)' : undefined }}>
                  {s.libelle}
                  {s.duree_jours ? ` · ${s.duree_jours} jour(s)` : ''}
                </div>
                <div className="row-sub" style={{ whiteSpace: 'pre-wrap' }}>{s.motif}</div>
                <div className="row-sub" style={{ fontSize: 12 }}>
                  {jour(s.date_faits)}
                  {s.last_name ? ` · ${s.first_name} ${s.last_name}` : ''}
                </div>
              </div>
              {gestion && (
                <button
                  type="button"
                  className="btn btn-quiet btn-danger"
                  style={{ padding: '6px 10px', fontSize: 13 }}
                  onClick={async () => {
                    if (!window.confirm('Retirer cette sanction ?')) return
                    await api.delete(`/api/vie-scolaire/sanctions/${s.id}`)
                    d.reload()
                  }}
                >
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
