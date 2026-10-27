import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

// L'enseignant choisit lui-meme ses matieres et ses classes
export default function MesAffectations() {
  const d = useApi('/api/notes/mes-affectations')
  const [mat, setMat] = useState([])
  const [cls, setCls] = useState([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (d.data) {
      setMat(d.data.matiereIds)
      setCls(d.data.classeIds)
    }
  }, [d.data])
  const bascule = (set) => (id) => set((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))

  async function enregistrer() {
    setError('')
    setOk('')
    setBusy(true)
    try {
      const r = await api.put('/api/notes/mes-affectations', { matiereIds: mat, classeIds: cls })
      setOk(
        `Enregistré.${r.data.dejaPrises ? ` ${r.data.dejaPrises} combinaison(s) déjà assurée(s) par un collègue n’ont pas été modifiées.` : ''}`,
      )
      d.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  if (!d.data) return <p className="muted">Chargement…</p>
  return (
    <>
      <h1 className="page-title">Mes classes et matières</h1>
      <p className="lede">Choisissez ce que vous enseignez cette année. Vous pourrez faire l’appel et publier les notes dans ces classes.</p>
      <div className="card">
        <span className="field-label">Matière(s)</span>
        <div className="chips">
          {d.data.matieres.map((m) => (
            <button key={m.id} type="button" className="chip" aria-pressed={mat.includes(m.id)} onClick={() => bascule(setMat)(m.id)}>
              {m.name}
            </button>
          ))}
        </div>
        <span className="field-label">Classes</span>
        <div className="chips">
          {d.data.classes.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={cls.includes(c.id)} onClick={() => bascule(setCls)(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      </div>
      <Note>{error}</Note>
      <Note kind="ok">{ok}</Note>
      <button type="button" className="btn btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={enregistrer}>
        {busy ? 'Enregistrement…' : `Enregistrer (${mat.length} matière(s), ${cls.length} classe(s))`}
      </button>
    </>
  )
}
