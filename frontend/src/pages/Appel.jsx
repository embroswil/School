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

// Appel d'une classe pour un jour : tout le monde present par defaut, on touche les absents
export default function Appel({ id }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const d = useApi(`/api/notes/appel/${id}?date=${date}`)
  const [statuts, setStatuts] = useState({})
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (d.data) setStatuts(Object.fromEntries(d.data.eleves.map((e) => [e.id, e.status || 'present'])))
  }, [d.data])

  async function enregistrer() {
    setError('')
    setOk('')
    setBusy(true)
    try {
      const r = await api.put(`/api/notes/appel/${id}`, {
        date,
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
      <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ marginBottom: 12 }} />
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
                  <span style={{ fontWeight: 800, color: (STATUTS.find((s) => s[0] === e.status) || [])[3] || 'var(--muted)' }}>
                    {e.status ? (STATUTS.find((s) => s[0] === e.status) || [])[2] : '—'}
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
              P : présent · A : absent · R : retard · J : absence justifiée. Les parents des absents reçoivent une notification.
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
