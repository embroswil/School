import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

const STATUTS = [
  ['present', 'P', 'Présent', 'var(--ok)'],
  ['absent', 'A', 'Absent', 'var(--danger)'],
  ['late', 'R', 'Retard', '#c25a00'],
  ['excused', 'J', 'Justifié', 'var(--muted)'],
]

// Date du jour sur le telephone (et non en temps universel)
const aujourdhui = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const maintenantHHMM = () => {
  const d = new Date()
  return d.getHours() * 100 + d.getMinutes()
}

// Appel d'une classe pour un jour : tout le monde present par defaut, on touche les absents
export default function Appel({ id }) {
  const [date, setDate] = useState(aujourdhui())
  const [auto, setAuto] = useState(true) // choisir le cours en cours automatiquement
  const [periode, setPeriode] = useState(null) // heure du cours (ex. 730) ; null : la journee
  const d = useApi(`/api/notes/appel/${id}?date=${date}${periode !== null ? `&periode=${periode}` : ''}`)
  const [statuts, setStatuts] = useState({})
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (d.data) setStatuts(Object.fromEntries(d.data.eleves.map((e) => [e.id, e.status || 'present'])))
  }, [d.data])

  // Enseignant : selectionne d'office le cours en cours (ou le prochain non fait) de l'emploi du temps
  useEffect(() => {
    if (!auto || !d.data?.modifiable || periode !== null || !d.data.cours?.length) return
    setAuto(false)
    const t = maintenantHHMM()
    const enCours = d.data.cours.find((c) => Number(c.debut.replace(':', '')) <= t && t < Number(c.fin.replace(':', '')))
    const suivant = d.data.cours.find((c) => !c.fait)
    const choix = enCours || suivant
    if (choix) setPeriode(choix.periode)
  }, [d.data, auto, periode])

  async function justifier(e, oui) {
    setError('')
    try {
      await api.post(`/api/notes/appel/${id}/justifier`, { studentId: e.id, date, periode, justifie: oui })
      d.reload()
    } catch (err) {
      setError(err.message)
    }
  }

  async function enregistrer() {
    setError('')
    setOk('')
    setBusy(true)
    try {
      const r = await api.put(`/api/notes/appel/${id}`, {
        date,
        periode,
        presences: Object.entries(statuts).map(([sid, statut]) => ({ studentId: Number(sid), statut })),
      })
      setOk(`Appel enregistré.${r.data.absentsSignales ? ` ${r.data.absentsSignales} absence(s) signalée(s) aux parents.` : ''}`)
      d.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const compte = (s) => Object.values(statuts).filter((x) => x === s).length
  const modif = d.data?.modifiable

  return (
    <>
      <h1 className="page-title">
        {modif ? 'Appel' : 'Présences'}
        {d.data ? ` · ${d.data.classe}` : ''}
      </h1>
      <input
        className="input"
        type="date"
        value={date}
        max={aujourdhui()}
        onChange={(e) => {
          setDate(e.target.value)
          setPeriode(null)
          setAuto(true)
        }}
        style={{ marginBottom: 12 }}
      />
      {d.data?.cours?.length > 0 && (
        <div className="chips">
          {d.data.cours.map((c) => (
            <button key={c.periode} type="button" className="chip" aria-pressed={periode === c.periode} onClick={() => setPeriode(c.periode)}>
              {c.fait ? '✓ ' : ''}
              {c.debut} {c.matiere || ''}
            </button>
          ))}
          <button type="button" className="chip" aria-pressed={periode === null} onClick={() => setPeriode(null)}>
            Toute la journée
          </button>
        </div>
      )}
      {!modif && d.data?.resume?.length > 0 && (
        <div className="card" style={{ marginBottom: 12, fontSize: 14 }}>
          <b>Résumé du jour</b>
          {d.data.resume.map((r) => (
            <div key={r.heure} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted">{r.heure}</span>
              <span>
                {r.absents} absent(s) · {r.retards} retard(s)
              </span>
            </div>
          ))}
        </div>
      )}
      {d.data && (
        <p className="lede" style={{ marginBottom: 10 }}>
          {!modif && !d.data.faite
            ? 'L’appel n’a pas encore été fait pour ce jour (il est fait en classe par l’enseignant).'
            : (
              <>
                {d.data.faite && modif ? '✓ Appel déjà fait ce jour (modifiable). ' : ''}
                {compte('present')} présent(s) · {compte('absent')} absent(s) · {compte('late')} retard(s) · {compte('excused')} justifié(s)
              </>
            )}
        </p>
      )}
      <Note>{error}</Note>
      <Note kind="ok">{ok}</Note>
      {d.loading && !d.data && <p className="muted">Chargement…</p>}
      {d.data && (
        <>
          <ul className="rows">
            {d.data.eleves.map((e, i) => (
              <li className="row" key={e.id} style={{ padding: '9px 12px', flexWrap: 'wrap' }}>
                <span className="muted" style={{ width: 22, fontSize: 13 }}>
                  {i + 1}
                </span>
                <div className="row-main">
                  <div className="row-title" style={{ fontSize: 15 }}>
                    {e.last_name} {e.first_name}
                  </div>
                </div>
                {!modif ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, color: (STATUTS.find((s) => s[0] === e.status) || [])[3] || 'var(--muted)' }}>
                      {e.status ? (STATUTS.find((s) => s[0] === e.status) || [])[2] : '—'}
                    </span>
                    {e.status === 'absent' && (
                      <button type="button" className="btn btn-quiet" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => justifier(e, true)}>
                        Justifier
                      </button>
                    )}
                    {e.status === 'excused' && (
                      <button type="button" className="btn btn-quiet" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => justifier(e, false)}>
                        Annuler
                      </button>
                    )}
                  </span>
                ) : (
                <div style={{ display: 'flex', gap: 4 }}>
                  {STATUTS.map(([k, lettre, titre, couleur]) => (
                    <button
                      key={k}
                      type="button"
                      title={titre}
                      aria-label={titre}
                      onClick={() => setStatuts((x) => ({ ...x, [e.id]: k }))}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        cursor: 'pointer',
                        font: '800 14px/1 var(--font-body)',
                        border: `1.5px solid ${statuts[e.id] === k ? couleur : 'var(--line)'}`,
                        background: statuts[e.id] === k ? couleur : 'var(--card)',
                        color: statuts[e.id] === k ? '#fff' : 'var(--muted)',
                      }}
                    >
                      {lettre}
                    </button>
                  ))}
                </div>
                )}
              </li>
            ))}
          </ul>
          {modif && (
            <p className="muted" style={{ fontSize: 13, margin: '8px 4px' }}>
              P : présent · A : absent · R : retard · J : absence justifiée. Les parents des absents reçoivent une notification. Faites l’appel à
              chaque heure de cours (choisissez le cours en haut).
            </p>
          )}
          {modif && (
            <button type="button" className="btn btn-block" style={{ marginTop: 8 }} disabled={busy} onClick={enregistrer}>
              {busy ? 'Enregistrement…' : 'Enregistrer l’appel'}
            </button>
          )}
        </>
      )}
    </>
  )
}
