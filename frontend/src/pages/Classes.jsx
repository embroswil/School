import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'

// Niveaux proposes (systemes francophone et anglophone)
const NIVEAUX = ['6e', '5e', '4e', '3e', '2nde', '1ère', 'Tle', 'SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2']

export default function Classes() {
  const classes = useApi('/api/etablissement/classes')
  const [noms, setNoms] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  async function creer(e) {
    e.preventDefault()
    setError('')
    setOk('')
    setBusy(true)
    try {
      const r = await api.post('/api/etablissement/classes', { noms: noms.split(/[,\n]/) })
      setOk(`${r.data.creees} classe(s) prête(s).`)
      setNoms('')
      classes.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  const ajouter = (n) => setNoms((x) => (x.trim() ? `${x.trim().replace(/,$/, '')}, ${n} ` : `${n} `))

  return (
    <>
      <h1 className="page-title">Classes</h1>
      <p className="lede">Classes de l’année scolaire en cours. Créez-les toutes en une fois : tapez les noms ou touchez les niveaux.</p>
      <form className="card" onSubmit={creer}>
        <Field label="Classes à créer (séparées par des virgules)">
          <textarea className="input" placeholder="ex. 6e A, 6e B, 5e A, 2nde C, Tle D" value={noms} onChange={(e) => setNoms(e.target.value)} />
        </Field>
        <div className="chips">
          {NIVEAUX.map((n) => (
            <button key={n} type="button" className="chip" onClick={() => ajouter(n)}>
              + {n}
            </button>
          ))}
        </div>
        <Note>{error}</Note>
        <Note kind="ok">{ok}</Note>
        <button className="btn btn-block" type="submit" disabled={busy || !noms.trim()}>
          {busy ? 'Création…' : 'Créer les classes'}
        </button>
      </form>

      <h2 className="section-title">{classes.data?.length ? `${classes.data.length} classe(s)` : 'Vos classes'}</h2>
      {classes.loading && <p className="muted">Chargement…</p>}
      {classes.data?.length === 0 && <p className="muted">Aucune classe pour le moment.</p>}
      {classes.data?.length > 0 && (
        <ul className="rows">
          {classes.data.map((c) => (
            <a className="row" key={c.id} href={`#/classes/${c.id}`}>
              <span style={{ fontSize: 22 }}>📚</span>
              <div className="row-main">
                <div className="row-title">{c.name}</div>
                <div className="row-sub">{c.eleves} élève(s)</div>
              </div>
              <span className="row-end">›</span>
            </a>
          ))}
        </ul>
      )}
    </>
  )
}
