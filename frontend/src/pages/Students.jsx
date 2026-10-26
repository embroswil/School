import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

// Eleves de l'etablissement : recherche, filtre par classe, placement, fiche
export default function Students() {
  const [q, setQ] = useState('')
  const [recherche, setRecherche] = useState('')
  const [classe, setClasse] = useState('')
  const eleves = useApi(`/api/etablissement/eleves?q=${encodeURIComponent(recherche)}${classe ? `&classe=${classe}` : ''}`)
  const classes = useApi('/api/etablissement/classes')
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

  const liste = eleves.data || []
  const sansClasse = liste.filter((e) => !e.class_id).length

  return (
    <>
      <div className="actions" style={{ marginTop: 4, marginBottom: 12 }}>
        <a className="btn" href="#/import-eleves" style={{ flex: 1 }}>
          📄 Importer une liste
        </a>
        <a className="btn btn-quiet" href="#/classes" style={{ flex: 1 }}>
          📚 Classes
        </a>
      </div>
      <form
        className="searchbar"
        onSubmit={(e) => {
          e.preventDefault()
          setRecherche(q)
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        <input className="input" placeholder="Rechercher un élève" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ width: 'auto', maxWidth: 140 }} value={classe} onChange={(e) => setClasse(e.target.value)}>
          <option value="">Toutes</option>
          {(classes.data || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </form>
      <p className="muted" style={{ marginBottom: 10, fontSize: 14 }}>
        {eleves.loading ? 'Chargement…' : `${liste.length} élève(s)`}
        {sansClasse > 0 && !classe ? ` · ${sansClasse} sans classe` : ''}
      </p>
      <Note>{error}</Note>
      {liste.length > 0 && (
        <ul className="rows">
          {liste.map((e) => (
            <li className="row" key={e.id}>
              <a className="row-main" href={`#/eleves/${e.id}`} style={{ color: 'inherit' }}>
                <div className="row-title">
                  {e.last_name} {e.first_name}
                </div>
                <div className="row-sub">
                  {e.class_name || `Déclaré : ${e.declared_class || '—'}`}
                  {e.parents > 0 ? ` · ${e.parents} parent(s)` : ''}
                </div>
              </a>
              {!e.class_id && (
                <select
                  className="input"
                  style={{ width: 'auto', maxWidth: 120, padding: '8px 10px' }}
                  value=""
                  disabled={busy === e.id || !classes.data?.length}
                  onChange={(ev) => placer(e.id, ev.target.value)}
                >
                  <option value="">Classe…</option>
                  {(classes.data || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
      )}
      {!eleves.loading && liste.length === 0 && (
        <p className="lede">Aucun élève. Importez une liste de classe pour commencer.</p>
      )}
    </>
  )
}
