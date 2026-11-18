import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

export const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

const COURTS = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const minutes = (h) => {
  const [a, b] = String(h || '').split(':').map(Number)
  return a * 60 + (b || 0)
}

// Affichage d'un emploi du temps : un jour a la fois (aujourd'hui par defaut), cours en cours mis en avant
export function GrilleEmploi({ creneaux, avecClasse = false }) {
  const jours = [1, 2, 3, 4, 5, 6].filter((j) => creneaux.some((c) => c.jour === j))
  const maintenant = new Date()
  const aujourdhui = maintenant.getDay()
  const [jour, setJour] = useState(() => (jours.includes(aujourdhui) ? aujourdhui : jours[0]))
  if (!creneaux.length) return <p className="muted">Aucun cours dans l’emploi du temps pour le moment.</p>
  const actuel = jours.includes(jour) ? jour : jours[0]
  const m = maintenant.getHours() * 60 + maintenant.getMinutes()
  const cours = creneaux.filter((c) => c.jour === actuel).sort((a, b) => minutes(a.debut) - minutes(b.debut))
  return (
    <>
      <div className="edt-jours" role="tablist">
        {jours.map((j) => (
          <button key={j} type="button" role="tab" aria-selected={j === actuel} onClick={() => setJour(j)}>
            {COURTS[j]}
            {j === aujourdhui && <i aria-hidden="true" />}
          </button>
        ))}
      </div>
      <p className="niveau-titre">{`${JOURS[actuel]}${actuel === aujourdhui ? ' · aujourd’hui' : ''} · ${cours.length} cours`}</p>
      <ul className="edt-cours">
        {cours.map((c) => {
          const enCours = actuel === aujourdhui && m >= minutes(c.debut) && m < minutes(c.fin)
          const qui = avecClasse ? c.classe : c.last_name ? `${c.first_name} ${c.last_name}` : ''
          return (
            <li key={c.id} className={enCours ? 'en-cours' : ''}>
              <span className="edt-h">
                <b>{c.debut}</b>
                <small>{c.fin}</small>
              </span>
              <span className="edt-m">
                <b>{c.matiere || 'Cours'}</b>
                {(qui || c.salle) && <small>{[qui, c.salle ? `Salle ${c.salle}` : ''].filter(Boolean).join(' · ')}</small>}
                {enCours && <em>En cours</em>}
              </span>
            </li>
          )
        })}
      </ul>
    </>
  )
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
