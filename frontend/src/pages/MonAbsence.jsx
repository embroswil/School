import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'

// L'enseignant previent l'etablissement de son absence
export default function MonAbsence() {
  const liste = useApi('/api/presence-enseignants/miennes')
  const [f, setF] = useState({ date: '', motif: '' })
  const [ok, setOk] = useState('')
  const [error, setError] = useState('')
  async function envoyer(e) {
    e.preventDefault()
    setError('')
    try {
      await api.post('/api/presence-enseignants', f)
      setOk('Absence signalée : l’administration est prévenue.')
      setF({ date: '', motif: '' })
      liste.reload()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <>
      <h1 className="page-title">Signaler une absence</h1>
      <p className="lede">Prévenez l’administration à l’avance : elle pourra organiser le remplacement.</p>
      <form className="card" onSubmit={envoyer}>
        <Field label="Date">
          <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
        </Field>
        <Field label="Motif (facultatif)">
          <input className="input" value={f.motif} onChange={(e) => setF({ ...f, motif: e.target.value })} placeholder="Ex. : formation, maladie…" />
        </Field>
        <Note kind="ok">{ok}</Note>
        <Note>{error}</Note>
        <button className="btn btn-block" type="submit">
          Envoyer
        </button>
      </form>
      {liste.data?.length > 0 && (
        <>
          <h2 className="section-title">Mes absences signalées</h2>
          <ul className="liste-eleves">
            {liste.data.map((a) => (
              <li key={a.id} style={{ padding: '10px 12px', gap: 10 }}>
                <span className="nom" style={{ flex: 1 }}>
                  <b>{new Date(a.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</b>
                  <small>{a.motif || 'Sans motif'}</small>
                </span>
                <button type="button" className="btn btn-quiet" style={{ padding: '5px 10px', fontSize: 12 }} onClick={async () => (await api.delete(`/api/presence-enseignants/${a.id}`), liste.reload())}>
                  Annuler
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
