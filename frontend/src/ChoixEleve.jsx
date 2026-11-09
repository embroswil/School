import { useEffect, useState } from 'react'
import { useApi } from './hooks.js'
import { trierClasses } from './classes.js'

// Choisir un eleve de l'etablissement : recherche par nom, ou classe puis eleve.
export default function ChoixEleve({ valeur, onChange }) {
  const classes = trierClasses(useApi('/api/etablissement/classes').data || [])
  const [classe, setClasse] = useState('')
  const [q, setQ] = useState('')
  const [rech, setRech] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setRech(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])
  const url = rech.length >= 2 ? `/api/etablissement/eleves?q=${encodeURIComponent(rech)}` : classe ? `/api/etablissement/eleves?classe=${classe}` : null
  const eleves = useApi(url)
  const choisi = valeur && (eleves.data || []).find((e) => String(e.id) === String(valeur))
  const [nomChoisi, setNomChoisi] = useState('')

  if (valeur) {
    return (
      <div className="choix-eleve-choisi">
        <span>
          <b>{choisi ? `${choisi.last_name} ${choisi.first_name}` : nomChoisi}</b>
          {choisi?.class_name && <small> · {choisi.class_name}</small>}
        </span>
        <button type="button" className="btn btn-quiet" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => onChange('')}>
          Changer
        </button>
      </div>
    )
  }
  return (
    <div className="choix-eleve">
      <div className="grid2">
        <select className="input" value={classe} onChange={(e) => (setClasse(e.target.value), setQ(''))}>
          <option value="">Choisir la classe…</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.eleves})
            </option>
          ))}
        </select>
        <input className="input" type="search" placeholder="ou rechercher un nom…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {url && (
        <div className="choix-eleve-liste">
          {eleves.loading && <p className="muted" style={{ padding: 10 }}>Chargement…</p>}
          {!eleves.loading && (eleves.data || []).length === 0 && <p className="muted" style={{ padding: 10 }}>Aucun élève.</p>}
          {(eleves.data || []).map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                setNomChoisi(`${e.last_name} ${e.first_name}`)
                onChange(String(e.id))
              }}
            >
              <b>
                {e.last_name} {e.first_name}
              </b>
              <small>{e.class_name || '—'}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
