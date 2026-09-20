import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Empty, Field, Loading, Note } from '../ui.jsx'
import { fullName } from '../format.js'

function ClassForm({ onCreated, onCancel }) {
  const years = useApi('/api/academic/academic-years?activeOnly=false')
  const teachers = useApi('/api/users?role=teacher&isActive=true&limit=100')
  const [form, setForm] = useState({ name: '', level: '', section: '', capacity: '40', yearId: '', teacherId: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (name) => (e) => setForm({ ...form, [name]: e.target.value })

  const yearList = years.data ?? []
  const yearId = form.yearId || String((yearList.find((y) => y.is_current) ?? yearList[0])?.id ?? '')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/api/classes', {
        name: form.name.trim(),
        level: form.level.trim(),
        section: form.section.trim() || undefined,
        capacity: form.capacity ? Number(form.capacity) : undefined,
        academicYearId: Number(yearId),
        classTeacherId: form.teacherId ? Number(form.teacherId) : undefined,
      })
      onCreated(form.name.trim())
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (years.loading) return <Loading />
  if (yearList.length === 0) {
    return (
      <>
        <p>Créez d’abord une année scolaire pour pouvoir ajouter des classes.</p>
        <div className="actions">
          <a className="btn" href="#/annees">
            Aller aux années scolaires
          </a>
          <button className="btn btn-quiet" type="button" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </>
    )
  }

  return (
    <form onSubmit={submit}>
      <h2 className="section-title">Nouvelle classe</h2>
      <Field label="Nom (par exemple 6e A)">
        <input className="input" required value={form.name} onChange={set('name')} />
      </Field>
      <Field label="Niveau (par exemple 6e)">
        <input className="input" required value={form.level} onChange={set('level')} />
      </Field>
      <Field label="Section (facultatif)">
        <input className="input" maxLength={10} value={form.section} onChange={set('section')} />
      </Field>
      <Field label="Nombre de places">
        <input className="input" type="number" inputMode="numeric" min="1" value={form.capacity} onChange={set('capacity')} />
      </Field>
      <Field label="Année scolaire">
        <select className="input" required value={yearId} onChange={set('yearId')}>
          {yearList.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Enseignant principal (facultatif)">
        <select className="input" value={form.teacherId} onChange={set('teacherId')}>
          <option value="">Aucun pour l’instant</option>
          {(teachers.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {fullName(t.firstName, t.lastName)}
            </option>
          ))}
        </select>
      </Field>
      <Note>{error}</Note>
      <div className="actions">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Création…' : 'Créer la classe'}
        </button>
        <button className="btn btn-quiet" type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  )
}

export default function Classes() {
  const classes = useApi('/api/classes')
  const [adding, setAdding] = useState(false)
  const [flash, setFlash] = useState('')

  function created(name) {
    setAdding(false)
    setFlash(`La classe ${name} est créée.`)
    classes.reload()
  }

  const list = classes.data ?? []

  return (
    <>
      <h1 className="page-title">Classes</h1>

      {adding ? (
        <ClassForm onCreated={created} onCancel={() => setAdding(false)} />
      ) : (
        <div className="actions">
          <button className="btn" type="button" onClick={() => setAdding(true)}>
            Ajouter une classe
          </button>
        </div>
      )}
      <Note kind="ok">{flash}</Note>
      <Note>{classes.error}</Note>
      {classes.loading && !classes.data ? <Loading /> : null}
      {!classes.loading && !classes.error && list.length === 0 && <Empty>Aucune classe pour l’instant.</Empty>}

      <ul className="rows">
        {list.map((c) => (
          <li key={c.id}>
            <a className="row" href={`#/classes/${c.id}`}>
              <div className="row-main">
                <span className="row-title">
                  {c.name}
                  {c.academic_year_name && <span className="tag">{c.academic_year_name}</span>}
                </span>
                <span className="row-sub">
                  {c.teacher_first_name
                    ? `Enseignant principal : ${fullName(c.teacher_first_name, c.teacher_last_name)}`
                    : 'Pas d’enseignant principal'}
                </span>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </>
  )
}
