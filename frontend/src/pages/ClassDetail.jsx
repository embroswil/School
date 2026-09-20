import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Empty, Field, Loading, Note } from '../ui.jsx'
import { ENROLLMENT_LABEL, fullName } from '../format.js'

function EnrollForm({ cls, enrolledIds, onDone }) {
  const students = useApi('/api/users?role=student&isActive=true&limit=100')
  const [studentId, setStudentId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const available = (students.data ?? []).filter((s) => !enrolledIds.has(s.id))

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/api/enrollments', {
        classId: cls.id,
        studentId: Number(studentId),
        academicYearId: cls.academic_year_id,
      })
      setStudentId('')
      setBusy(false)
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (students.loading && !students.data) return <Loading />
  if (available.length === 0) {
    return <Empty>Tous les élèves actifs sont déjà dans cette classe, ou aucun élève n’a encore de compte.</Empty>
  }

  return (
    <form onSubmit={submit}>
      <Field label="Inscrire un élève">
        <select className="input" required value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">Choisir un élève</option>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {fullName(s.firstName, s.lastName)}
            </option>
          ))}
        </select>
      </Field>
      <Note>{error}</Note>
      <div className="actions">
        <button className="btn" type="submit" disabled={busy || !studentId}>
          {busy ? 'Inscription…' : 'Inscrire dans la classe'}
        </button>
      </div>
    </form>
  )
}

export default function ClassDetail({ id }) {
  const cls = useApi(`/api/classes/${id}`)
  const roster = useApi(`/api/classes/${id}/students`)
  const [rowError, setRowError] = useState('')

  const students = roster.data ?? []
  const enrolledIds = new Set(students.map((s) => s.student_id))
  const c = cls.data

  async function remove(student) {
    const name = fullName(student.student_first_name, student.student_last_name)
    if (!window.confirm(`Retirer ${name} de cette classe ?`)) return
    setRowError('')
    try {
      await api.delete(`/api/enrollments/${id}/${student.student_id}/${student.academic_year_id}`)
      roster.reload()
    } catch (err) {
      setRowError(err.message)
    }
  }

  return (
    <>
      <a className="back" href="#/classes">
        Retour aux classes
      </a>
      <h1 className="page-title">{c?.name ?? 'Classe'}</h1>
      <Note>{cls.error}</Note>
      {c && (
        <p className="lede">
          Niveau {c.level}
          {c.section ? `, section ${c.section}` : ''}. {students.length} {students.length > 1 ? 'élèves' : 'élève'} pour{' '}
          {c.capacity ?? 40} places.
        </p>
      )}
      <div className="gap" />

      <h2 className="section-title">Élèves</h2>
      <Note>{roster.error || rowError}</Note>
      {roster.loading && !roster.data ? <Loading /> : null}
      {!roster.loading && !roster.error && students.length === 0 && <Empty>Aucun élève inscrit dans cette classe.</Empty>}
      <ul className="rows">
        {students.map((s) => (
          <li className="row" key={s.id}>
            <div className="row-main">
              <span className="row-title">
                {fullName(s.student_first_name, s.student_last_name)}
                {s.status !== 'active' && <span className="tag">{ENROLLMENT_LABEL[s.status] ?? s.status}</span>}
              </span>
              <span className="row-sub">{s.student_email}</span>
            </div>
            <button className="btn btn-quiet btn-danger" type="button" onClick={() => remove(s)}>
              Retirer
            </button>
          </li>
        ))}
      </ul>

      <div className="gap" />
      {c && <EnrollForm cls={c} enrolledIds={enrolledIds} onDone={() => roster.reload()} />}
    </>
  )
}
