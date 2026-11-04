import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { IcClasses, IcImport } from '../icones.jsx'
import StatutScolarite from './StatutScolarite.jsx'

// Eleves de l'etablissement : recherche, filtre par classe, placement, fiche
export default function Students() {
  const [q, setQ] = useState('')
  const [recherche, setRecherche] = useState('')
  const [classe, setClasse] = useState('')
  const eleves = useApi(`/api/etablissement/eleves?q=${encodeURIComponent(recherche)}${classe ? `&classe=${classe}` : ''}`)
  const classes = useApi('/api/etablissement/classes')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const [scol, setScol] = useState('') // '' | 'regle' | 'non'

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

  const statutDe = (e) => (!e.scol_du ? 'aucun' : e.scol_paye >= e.scol_du ? 'regle' : e.scol_paye > 0 ? 'partiel' : 'non_paye')
  const tous = eleves.data || []
  const liste = scol === 'regle' ? tous.filter((e) => statutDe(e) === 'regle') : scol === 'non' ? tous.filter((e) => ['partiel', 'non_paye'].includes(statutDe(e))) : tous
  const sansClasse = liste.filter((e) => !e.class_id).length

  return (
    <>
      <div className="eleves-tete">
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Élèves</h1>
          <p className="muted" style={{ fontSize: 14 }}>
            {eleves.loading ? 'Chargement…' : `${liste.length.toLocaleString('fr-FR')} élève(s)`}
            {sansClasse > 0 && !classe ? ` · ${sansClasse} sans classe` : ''}
          </p>
        </div>
        <a className="btn btn-quiet bouton-icone" href="#/classes" aria-label="Classes">
          <IcClasses size={18} /> Classes
        </a>
        <a className="btn bouton-icone" href="#/import-eleves" aria-label="Importer une liste">
          <IcImport size={18} /> Importer
        </a>
      </div>
      <form
        className="filtres-eleves"
        onSubmit={(e) => {
          e.preventDefault()
          setRecherche(q)
        }}
      >
        <input className="input" type="search" placeholder="Rechercher un nom…" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setRecherche(q)} />
        <select className="input" value={classe} onChange={(e) => setClasse(e.target.value)}>
          <option value="">Toutes les classes</option>
          {(classes.data || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </form>
      {tous.some((e) => e.scol_du) && (
        <div className="chips" style={{ marginBottom: 10 }}>
          <button type="button" className="chip" aria-pressed={!scol} onClick={() => setScol('')}>
            Tous
          </button>
          <button type="button" className="chip" aria-pressed={scol === 'regle'} onClick={() => setScol('regle')}>
            Scolarité réglée ({tous.filter((e) => statutDe(e) === 'regle').length})
          </button>
          <button type="button" className="chip" aria-pressed={scol === 'non'} onClick={() => setScol('non')}>
            Non réglée ({tous.filter((e) => ['partiel', 'non_paye'].includes(statutDe(e))).length})
          </button>
        </div>
      )}
      <Note>{error}</Note>
      {liste.length > 0 && (
        <ul className="liste-eleves">
          {liste.map((e) => (
            <li key={e.id}>
              <a href={`#/eleves/${e.id}`}>
                <span className="initiales">
                  {(e.last_name || '?')[0]}
                  {(e.first_name || '')[0]}
                </span>
                <span className="nom">
                  <b>
                    {e.last_name} {e.first_name}
                  </b>
                  <small>
                    {e.class_name || `Déclaré : ${e.declared_class || '—'}`}
                    {e.parents > 0 ? ` · ${e.parents} parent(s)` : ''}
                    {e.a_un_compte ? ' · compte' : ''}
                  </small>
                </span>
                <StatutScolarite statut={statutDe(e)} reste={e.scol_du - e.scol_paye} />
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
      {!eleves.loading && liste.length === 0 && <p className="lede">Aucun élève. Importez une liste de classe pour commencer.</p>}
    </>
  )
}
