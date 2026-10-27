import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

export const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

// Affichage d'un emploi du temps, jour par jour
export function GrilleEmploi({ creneaux, avecClasse = false }) {
  if (!creneaux.length) return <p className="muted">Aucun cours dans l’emploi du temps pour le moment.</p>
  const aujourdhui = new Date().getDay()
  return [1, 2, 3, 4, 5, 6]
    .filter((j) => creneaux.some((c) => c.jour === j))
    .map((j) => (
      <section key={j} style={{ marginBottom: 14 }}>
        <p className="groupe-titre" style={{ margin: '10px 4px 6px', color: j === aujourdhui ? 'var(--primary)' : undefined }}>
          {JOURS[j]}
          {j === aujourdhui ? ' · aujourd’hui' : ''}
        </p>
        <ul className="rows">
          {creneaux
            .filter((c) => c.jour === j)
            .map((c) => (
              <li className="row" key={c.id} style={{ padding: '10px 14px' }}>
                <b style={{ width: 92, fontSize: 14 }}>
                  {c.debut} – {c.fin}
                </b>
                <div className="row-main">
                  <div className="row-title">{c.matiere || 'Cours'}</div>
                  <div className="row-sub">
                    {avecClasse ? c.classe : c.last_name ? `${c.first_name} ${c.last_name}` : ''}
                    {c.salle ? ` · ${c.salle}` : ''}
                  </div>
                </div>
              </li>
            ))}
        </ul>
      </section>
    ))
}

// Emploi du temps d'une classe : consultation, et saisie par l'administration
export default function EmploiDuTemps({ id }) {
  const d = useApi(`/api/vie-scolaire/emplois/classes/${id}`)
  const matieres = useApi(d.data?.modifiable ? '/api/etablissement/matieres' : null)
  const [edition, setEdition] = useState(false)
  const [lignes, setLignes] = useState([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (d.data) setLignes(d.data.creneaux.map((c) => ({ jour: c.jour, debut: c.debut, fin: c.fin, subjectId: c.subject_id || '', salle: c.salle || '' })))
  }, [d.data])

  const maj = (i, k) => (e) => setLignes((l) => l.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))
  const ajouter = () => {
    const der = lignes[lignes.length - 1]
    setLignes((l) => [...l, der ? { ...der, debut: der.fin, fin: '', subjectId: '' } : { jour: 1, debut: '07:30', fin: '08:25', subjectId: '', salle: '' }])
  }
  async function enregistrer() {
    setError('')
    setOk('')
    setBusy(true)
    try {
      await api.put(`/api/vie-scolaire/emplois/classes/${id}`, { creneaux: lignes })
      setOk('Emploi du temps enregistré.')
      setEdition(false)
      d.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  return (
    <>
      <h1 className="page-title">Emploi du temps · {d.data.classe}</h1>
      <Note kind="ok">{ok}</Note>
      {!edition ? (
        <>
          {d.data.modifiable && (
            <button type="button" className="btn btn-block" style={{ marginBottom: 14 }} onClick={() => setEdition(true)}>
              ✏️ {d.data.creneaux.length ? 'Modifier l’emploi du temps' : 'Saisir l’emploi du temps'}
            </button>
          )}
          <GrilleEmploi creneaux={d.data.creneaux} />
        </>
      ) : (
        <>
          <p className="lede">Une ligne par cours. L’enseignant de chaque cours est celui affecté à la matière dans la classe.</p>
          {lignes.map((x, i) => (
            <div className="card" key={i} style={{ padding: 12 }}>
              <div className="grid2">
                <select className="input" value={x.jour} onChange={maj(i, 'jour')}>
                  {JOURS.slice(1).map((j, k) => (
                    <option key={j} value={k + 1}>
                      {j}
                    </option>
                  ))}
                </select>
                <select className="input" value={x.subjectId} onChange={maj(i, 'subjectId')}>
                  <option value="">Matière…</option>
                  {(matieres.data || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginTop: 8 }}>
                <input className="input" type="time" value={x.debut} onChange={maj(i, 'debut')} />
                <input className="input" type="time" value={x.fin} onChange={maj(i, 'fin')} />
                <input className="input" placeholder="Salle" value={x.salle} onChange={maj(i, 'salle')} />
                <button type="button" className="btn btn-quiet btn-danger" style={{ padding: '8px 12px' }} onClick={() => setLignes((l) => l.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-quiet btn-block" style={{ margin: '10px 0' }} onClick={ajouter}>
            + Ajouter un cours
          </button>
          <Note>{error}</Note>
          <div className="actions">
            <button type="button" className="btn" disabled={busy} onClick={enregistrer}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setEdition(false)}>
              Annuler
            </button>
          </div>
        </>
      )}
    </>
  )
}

// Emploi du temps de l'enseignant (tous ses cours)
export function MonEmploi() {
  const d = useApi('/api/vie-scolaire/emplois/moi')
  if (!d.data) return <p className="muted">Chargement…</p>
  return (
    <>
      <h1 className="page-title">Mon emploi du temps</h1>
      <GrilleEmploi creneaux={d.data.creneaux} avecClasse />
    </>
  )
}
