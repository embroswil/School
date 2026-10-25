import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

// Eleves de l'etablissement : classe declaree a l'inscription, placement en classe
export default function Students() {
  const [q, setQ] = useState('')
  const [recherche, setRecherche] = useState('')
  const eleves = useApi(`/api/etablissement/eleves?q=${encodeURIComponent(recherche)}`)
  const classes = useApi('/api/classes')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)

  async function placer(eleveId, classId) {
    if (!classId) return
    setError('')
    setBusy(eleveId)
    try {
      await api.post(`/api/etablissement/eleves/${eleveId}/classe`, { classId: Number(classId) })
      eleves.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(null)
  }

  const sansClasse = (eleves.data || []).filter((e) => !e.class_id).length

  return (
    <>
      <h1 className="page-title">Élèves</h1>
      <p className="lede">
        Les élèves s’inscrivent eux-mêmes en indiquant leur classe. Placez-les dans la bonne classe.
        {sansClasse > 0 && (
          <>
            {' '}
            <b>{sansClasse} sans classe.</b>
          </>
        )}
      </p>
      <form
        className="searchbar"
        onSubmit={(e) => {
          e.preventDefault()
          setRecherche(q)
        }}
      >
        <input className="input" placeholder="Rechercher un élève" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <Note>{error}</Note>
      {classes.data?.length === 0 && (
        <Note kind="ok">
          Créez d’abord une <a href="#/annees">année scolaire</a>, puis vos <a href="#/classes">classes</a>.
        </Note>
      )}
      {eleves.loading && <p className="muted">Chargement…</p>}
      {eleves.data?.length === 0 && <p className="muted">Aucun élève inscrit pour le moment.</p>}
      {eleves.data?.length > 0 && (
        <ul className="rows">
          {eleves.data.map((e) => (
            <li className="row" key={e.id} style={{ flexWrap: 'wrap' }}>
              <div className="row-main">
                <div className="row-title">
                  {e.first_name} {e.last_name}
                </div>
                <div className="row-sub">
                  Déclaré : {e.declared_class || '—'}
                  {e.parents > 0 ? ` · ${e.parents} parent(s)` : ''}
                </div>
              </div>
              <select
                className="input"
                style={{ width: 'auto', minWidth: 130, padding: '9px 10px' }}
                value={e.class_id || ''}
                disabled={busy === e.id || !classes.data?.length}
                onChange={(ev) => placer(e.id, ev.target.value)}
              >
                <option value="">{e.class_id ? '' : 'Choisir la classe'}</option>
                {(classes.data || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
