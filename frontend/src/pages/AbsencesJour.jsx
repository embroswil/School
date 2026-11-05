import { useState } from 'react'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

const aujourdhui = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Absences et retards du jour dans tout l'etablissement (surveillant general, censeur)
export default function AbsencesJour() {
  const [date, setDate] = useState(aujourdhui())
  const [filtre, setFiltre] = useState('')
  const d = useApi(`/api/notes/absences?date=${date}`)

  const lignes = (d.data?.lignes || []).filter((l) => !filtre || `${l.last_name} ${l.first_name} ${l.classe}`.toLowerCase().includes(filtre.toLowerCase()))
  const parClasse = {}
  for (const l of lignes) (parClasse[l.classe] ||= []).push(l)

  return (
    <>
      <h1 className="page-title">Absences du jour</h1>
      <p className="lede">
        Les absences sont saisies par les enseignants à chaque cours. Pour informer les familles, publiez votre récapitulatif mensuel ou par séquence :{' '}
        <a href="#/document">téléverser le récapitulatif</a>.
      </p>
      <input className="input" type="date" value={date} max={aujourdhui()} onChange={(e) => setDate(e.target.value)} style={{ marginBottom: 12 }} />
      {d.data && (
        <div className="kpis">
          <div className="kpi">
            <b style={{ color: d.data.absents ? 'var(--danger)' : undefined }}>{d.data.absents}</b>
            <span>élève(s) absent(s)</span>
          </div>
          <div className="kpi">
            <b>
              {d.data.classesAppel}/{d.data.classes}
            </b>
            <span>classes appelées</span>
          </div>
        </div>
      )}
      <input className="input" placeholder="Filtrer (nom ou classe)" value={filtre} onChange={(e) => setFiltre(e.target.value)} style={{ margin: '12px 0' }} />
      <Note>{d.error}</Note>
      {!d.data && !d.error && <p className="muted">Chargement…</p>}
      {d.data && lignes.length === 0 && <p className="muted">Aucune absence enregistrée ce jour. 👍</p>}
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
                <b style={{ color: 'var(--danger)', fontSize: 13 }}>Absent</b>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}
