import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

// Saisie des notes d'une evaluation : une ligne par eleve
export default function Evaluation({ id }) {
  const d = useApi(`/api/notes/evaluations/${id}`)
  const [notes, setNotes] = useState({})
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!d.data) return
    setNotes(
      Object.fromEntries(
        d.data.eleves.map((e) => [e.id, { note: e.note === null ? '' : String(Number(e.note)).replace('.', ','), absent: e.absent }]),
      ),
    )
  }, [d.data])

  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const { evaluation: ev, eleves } = d.data
  const modif = ev.modifiable
  const bareme = Number(ev.bareme)
  const saisies = Object.values(notes).filter((n) => n.note !== '' || n.absent).length

  async function enregistrer(publier) {
    setError('')
    setOk('')
    setBusy(true)
    try {
      await api.put(`/api/notes/evaluations/${id}`, {
        notes: Object.entries(notes).map(([sid, n]) => ({
          studentId: Number(sid),
          note: n.absent || n.note === '' ? null : n.note.replace(',', '.'),
          absent: n.absent,
        })),
        publiee: publier ? true : undefined,
      })
      setOk(publier ? 'Notes publiées : les parents et les élèves sont notifiés.' : 'Notes enregistrées (brouillon).')
      d.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  async function supprimer() {
    if (!window.confirm('Supprimer cette évaluation et toutes ses notes ?')) return
    await api.delete(`/api/notes/evaluations/${id}`)
    window.history.back()
  }

  const maj = (sid, k, v) => setNotes((x) => ({ ...x, [sid]: { ...x[sid], [k]: v } }))

  return (
    <>
      <h1 className="page-title" style={{ fontSize: 22 }}>
        {ev.matiere} · {ev.classe}
      </h1>
      <p className="lede" style={{ marginBottom: 12 }}>
        {ev.titre} · Séquence {ev.sequence} · noté sur {bareme} · {ev.publiee ? 'publiée' : 'brouillon'}
      </p>

      {!modif && (
        <div className="note note-ok" style={{ fontWeight: 400 }}>
          Consultation : seules les enseignantes et enseignants de cette matière peuvent modifier ces notes.
        </div>
      )}
      {modif && (
      <div className="barre-import" style={{ position: 'sticky', top: 'calc(64px + env(safe-area-inset-top))', zIndex: 10 }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, border: '2px solid var(--primary)' }}>
          <div style={{ flex: 1 }}>
            <b>
              {saisies}/{eleves.length} notes
            </b>
          </div>
          <button type="button" className="btn btn-quiet" style={{ padding: '10px 12px', fontSize: 14 }} disabled={busy} onClick={() => enregistrer(false)}>
            Enregistrer
          </button>
          <button type="button" className="btn" style={{ padding: '10px 12px', fontSize: 14 }} disabled={busy} onClick={() => enregistrer(true)}>
            {ev.publiee ? 'Mettre à jour' : 'Publier'}
          </button>
        </div>
      </div>
      )}
      <Note>{error}</Note>
      <Note kind="ok">{ok}</Note>

      <ul className="rows" style={{ marginTop: 10 }}>
        {eleves.map((e, i) => {
          const n = notes[e.id] || { note: '', absent: false }
          const val = Number(String(n.note).replace(',', '.'))
          const faux = n.note !== '' && !(val >= 0 && val <= bareme)
          return (
            <li className="row" key={e.id} style={{ padding: '10px 14px' }}>
              <span className="muted" style={{ width: 24, fontSize: 13 }}>
                {i + 1}
              </span>
              <div className="row-main">
                <div className="row-title" style={{ fontSize: 15 }}>
                  {e.last_name} {e.first_name}
                </div>
              </div>
              {!modif ? (
                <b style={{ minWidth: 60, textAlign: 'right' }}>{n.absent ? 'Abs' : n.note === '' ? '—' : `${n.note}/${bareme}`}</b>
              ) : (
              <>
              <button
                type="button"
                className="chip"
                aria-pressed={n.absent}
                style={{ padding: '7px 10px', fontSize: 12 }}
                onClick={() => maj(e.id, 'absent', !n.absent)}
              >
                Abs
              </button>
              <input
                className="input"
                inputMode="decimal"
                disabled={n.absent}
                value={n.absent ? '' : n.note}
                placeholder={`/${bareme}`}
                onChange={(ev2) => maj(e.id, 'note', ev2.target.value)}
                style={{ width: 72, padding: '8px 10px', textAlign: 'center', borderColor: faux ? 'var(--danger)' : undefined }}
              />
              </>
              )}
            </li>
          )
        })}
      </ul>
      {modif && (
        <button type="button" className="btn btn-quiet btn-danger btn-block" style={{ marginTop: 18 }} onClick={supprimer}>
          Supprimer l’évaluation
        </button>
      )}
    </>
  )
}
