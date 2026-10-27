import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

const n2 = (n) => (n === null || n === undefined ? '—' : Number(n).toFixed(2).replace('.', ','))

// Conseil de classe de fin d'annee : moyenne annuelle, rang, decisions
export default function ConseilAnnuel({ id }) {
  const d = useApi(`/api/notes/classes/${id}/annuel`)
  const [dec, setDec] = useState({})
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (d.data) setDec(Object.fromEntries(d.data.eleves.map((e) => [e.id, { decision: e.decision || e.proposition || '', observation: e.observation || '' }])))
  }, [d.data])

  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Calcul…</p>
  const { eleves, stats, decisions, modifiable } = d.data

  async function enregistrer() {
    setError('')
    setOk('')
    setBusy(true)
    try {
      const r = await api.put(`/api/notes/classes/${id}/decisions`, {
        decisions: Object.entries(dec).map(([studentId, v]) => ({ studentId: Number(studentId), ...v })),
      })
      setOk(`${r.data.enregistrees} décision(s) enregistrée(s). Elles apparaissent sur le bulletin du 3e trimestre et chez les parents.`)
      d.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <>
      <h1 className="page-title">Conseil de fin d’année · {d.data.classe}</h1>
      <p className="lede">Moyenne annuelle = moyenne des trois trimestres. Une décision est proposée automatiquement (≥ 10 : admis ; ≥ 9 : sous réserve ; sinon : redouble), modifiable.</p>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 0 }}>
        <div className="stat">
          <b>{n2(stats.moyenneClasse)}</b>
          <span>moyenne</span>
        </div>
        <div className="stat">
          <b style={{ color: 'var(--ok)' }}>{stats.admis}</b>
          <span>admis</span>
        </div>
        <div className="stat">
          <b style={{ color: 'var(--danger)' }}>{stats.redoublants}</b>
          <span>redoublent</span>
        </div>
      </div>
      <Note>{error}</Note>
      <Note kind="ok">{ok}</Note>
      <ul className="rows" style={{ marginTop: 14 }}>
        {eleves.map((e) => (
          <li key={e.id} style={{ padding: '12px 14px', borderTop: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <b style={{ width: 34, color: 'var(--muted)' }}>{e.rang ? `${e.rang}e` : '—'}</b>
              <div className="row-main">
                <div className="row-title">
                  {e.nom} {e.prenom}
                </div>
                <div className="row-sub">T1 {n2(e.trimestres[0])} · T2 {n2(e.trimestres[1])} · T3 {n2(e.trimestres[2])}</div>
              </div>
              <b style={{ color: e.annuelle >= 10 ? 'var(--ok)' : e.annuelle ? 'var(--danger)' : 'var(--muted)' }}>{n2(e.annuelle)}</b>
            </div>
            {modifiable ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <select className="input" style={{ padding: '8px 10px' }} value={dec[e.id]?.decision || ''} onChange={(ev) => setDec((x) => ({ ...x, [e.id]: { ...x[e.id], decision: ev.target.value } }))}>
                  <option value="">Décision…</option>
                  {Object.entries(decisions).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <input className="input" style={{ padding: '8px 10px' }} placeholder="Observation" value={dec[e.id]?.observation || ''} onChange={(ev) => setDec((x) => ({ ...x, [e.id]: { ...x[e.id], observation: ev.target.value } }))} />
              </div>
            ) : (
              e.decision && <div className="row-sub" style={{ marginTop: 6 }}>{decisions[e.decision]}</div>
            )}
          </li>
        ))}
      </ul>
      {modifiable && (
        <button type="button" className="btn btn-block" style={{ marginTop: 14 }} disabled={busy} onClick={enregistrer}>
          {busy ? 'Enregistrement…' : 'Enregistrer les décisions'}
        </button>
      )}
    </>
  )
}
