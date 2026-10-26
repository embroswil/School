import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Empty, Field, Loading, Note } from '../ui.jsx'
import { fmtDate } from '../format.js'

function YearForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', isCurrent: true })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/api/academic/academic-years', { ...form, isActive: true })
      onCreated(form.name)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <h2 className="section-title">Nouvelle année scolaire</h2>
      <Field label="Nom (par exemple 2025-2026)">
        <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Date de début">
        <input
          className="input"
          type="date"
          required
          value={form.startDate}
          onChange={(e) => setForm({ ...form, startDate: e.target.value })}
        />
      </Field>
      <Field label="Date de fin">
        <input
          className="input"
          type="date"
          required
          value={form.endDate}
          onChange={(e) => setForm({ ...form, endDate: e.target.value })}
        />
      </Field>
      <label className="check">
        <input type="checkbox" checked={form.isCurrent} onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })} />
        <span>Définir comme année en cours</span>
      </label>
      <Note>{error}</Note>
      <div className="actions">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Création…' : 'Créer l’année'}
        </button>
        <button className="btn btn-quiet" type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  )
}

export default function Years() {
  const years = useApi('/api/academic/academic-years?activeOnly=false')
  const [adding, setAdding] = useState(false)
  const [flash, setFlash] = useState('')
  const [rowError, setRowError] = useState('')

  async function makeCurrent(year) {
    setRowError('')
    setFlash('')
    try {
      await api.put(`/api/academic/academic-years/${year.id}/set-current`)
      years.reload()
    } catch (err) {
      setRowError(err.message)
    }
  }

  function created(name) {
    setAdding(false)
    setFlash(`L’année ${name} est créée.`)
    years.reload()
  }

  const list = years.data ?? []

  return (
    <>
      <h1 className="page-title">Années scolaires</h1>

      {adding ? (
        <YearForm onCreated={created} onCancel={() => setAdding(false)} />
      ) : (
        <div className="actions">
          <button className="btn" type="button" onClick={() => setAdding(true)}>
            Ajouter une année
          </button>
        </div>
      )}
      <Note kind="ok">{flash}</Note>
      <Note>{years.error || rowError}</Note>
      {years.loading && !years.data ? <Loading /> : null}
      {!years.loading && !years.error && list.length === 0 && (
        <Empty>Aucune année scolaire. Ajoutez la première pour pouvoir créer des classes.</Empty>
      )}

      <ul className="rows">
        {list.map((year) => (
          <li className="row" key={year.id}>
            <div className="row-main">
              <span className="row-title">
                {year.name}
                {year.is_current && <span className="tag tag-now">en cours</span>}
              </span>
              <span className="row-sub">
                Du {fmtDate(year.start_date)} au {fmtDate(year.end_date)}
              </span>
            </div>
            {!year.is_current && (
              <button className="btn btn-quiet" type="button" onClick={() => makeCurrent(year)}>
                Définir en cours
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
