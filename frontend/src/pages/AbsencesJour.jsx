import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

const aujourdhui = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const STATUT = { absent: ['Absent', 'var(--danger)'], late: ['Retard', '#ffb35c'], excused: ['Justifiée', 'var(--muted)'] }

// Absences et retards du jour dans tout l'etablissement (surveillant general, censeur)
export default function AbsencesJour() {
  const [date, setDate] = useState(aujourdhui())
  const [filtre, setFiltre] = useState('')
  const d = useApi(`/api/notes/absences?date=${date}`)
  const [error, setError] = useState('')

  async function justifier(l, oui) {
    setError('')
    try {
      await api.post(`/api/notes/appel/${l.class_id}/justifier`, { studentId: l.student_id, date, periode: l.period_number, justifie: oui })
      d.reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const lignes = (d.data?.lignes || []).filter((l) => !filtre || l.status === filtre)
  const parClasse = {}
  for (const l of lignes) (parClasse[l.classe] ||= []).push(l)

  return (
    <>
      <h1 className="page-title">Absences du jour</h1>
      <input className="input" type="date" value={date} max={aujourdhui()} onChange={(e) => setDate(e.target.value)} style={{ marginBottom: 12 }} />
      {d.data && (
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <div className="kpi">
            <b style={{ color: d.data.absents ? 'var(--danger)' : undefined }}>{d.data.absents}</b>
            <span>élève(s) absent(s)</span>
          </div>
          <div className="kpi">
            <b>{d.data.retards}</b>
            <span>retard(s)</span>
          </div>
          <div className="kpi">
            <b>
              {d.data.classesAppel}/{d.data.classes}
            </b>
            <span>classes appelées</span>
          </div>
        </div>
      )}
      <div className="chips" style={{ marginTop: 12 }}>
        {[
          ['', 'Tout'],
          ['absent', 'Absents'],
          ['late', 'Retards'],
          ['excused', 'Justifiées'],
        ].map(([k, v]) => (
          <button key={k} type="button" className="chip" aria-pressed={filtre === k} onClick={() => setFiltre(k)}>
            {v}
          </button>
        ))}
      </div>
      <Note>{error || d.error}</Note>
      {!d.data && !d.error && <p className="muted">Chargement…</p>}
      {d.data && lignes.length === 0 && <p className="muted">Aucune absence ni retard enregistré ce jour. 👍</p>}
      {Object.entries(parClasse).map(([classe, ls]) => (
        <section key={classe}>
          <p className="niveau-titre">{classe}</p>
          <ul className="liste-eleves">
            {ls.map((l, i) => (
              <li key={i} style={{ padding: '10px 12px', gap: 10 }}>
                <span className="nom" style={{ flex: 1, minWidth: 0 }}>
                  <b>
                    {l.last_name} {l.first_name}
                  </b>
                  <small>
                    {l.heure}
                    {l.parents ? '' : ' · aucun parent relié'}
                  </small>
                </span>
                <b style={{ color: STATUT[l.status][1], fontSize: 13 }}>{STATUT[l.status][0]}</b>
                {l.status === 'absent' && (
                  <button type="button" className="btn btn-quiet" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => justifier(l, true)}>
                    Justifier
                  </button>
                )}
                {l.status === 'excused' && (
                  <button type="button" className="btn btn-quiet" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => justifier(l, false)}>
                    Annuler
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}
