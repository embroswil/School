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

// Nom court d'une matiere, pour que le tableau tienne sur l'ecran d'un telephone
const COURTES = { mathematiques: 'Maths', informatique: 'Info', 'physique-chimie': 'PCT', 'histoire-geographie': 'Hist-Géo', geographie: 'Géo', philosophie: 'Philo',
  'sciences de la vie et de la terre': 'SVT', 'arts plastiques': 'Arts', 'education physique et sportive': 'EPS', 'education a la citoyennete et a la morale': 'ECM',
  'langues et cultures nationales': 'LCN', litterature: 'Litt.', 'travaux manuels': 'TM', 'education artistique': 'Arts', economie: 'Éco' }
const sansAcc = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
export function matiereCourte(nom) {
  const n = String(nom || '').trim()
  const sigle = n.match(/\(([A-ZÀ-Ü0-9.\- ]{2,8})\)\s*$/)
  if (sigle) return sigle[1]
  const k = sansAcc(n)
  if (COURTES[k]) return COURTES[k]
  if (n.length <= 10) return n
  const mots = n.split(/[\s'’]+/).filter((m) => m && !/^(et|de|des|du|la|le|les|l|d|a|en)$/i.test(m))
  if (mots.length > 1) return mots.map((m) => m[0].toUpperCase()).join('')
  return `${n.slice(0, 6)}.`
}
const telephone = () => typeof window !== 'undefined' && window.innerWidth < 640 && !document.documentElement.classList.contains('ordi')

// Affichage d'un emploi du temps en tableau : une colonne par jour, une ligne par horaire ;
// les pauses (recreation) apparaissent entre deux horaires, le cours en cours est mis en avant.
export function GrilleEmploi({ creneaux, avecClasse = false }) {
  if (!creneaux.length) return <p className="muted">Aucun cours dans l’emploi du temps pour le moment.</p>
  const maintenant = new Date()
  const aujourdhui = maintenant.getDay()
  const m = maintenant.getHours() * 60 + maintenant.getMinutes()
  const jours = [1, 2, 3, 4, 5, 6].filter((j) => j <= 5 || creneaux.some((c) => c.jour === j))
  // horaires distincts de la semaine, dans l'ordre
  const plages = [...new Map(creneaux.map((c) => [`${c.debut}-${c.fin}`, { debut: c.debut, fin: c.fin }])).values()].sort(
    (a, b) => minutes(a.debut) - minutes(b.debut) || minutes(a.fin) - minutes(b.fin),
  )
  const lignes = []
  plages.forEach((p, i) => {
    const prec = plages[i - 1]
    if (prec && minutes(p.debut) - minutes(prec.fin) >= 10) lignes.push({ pause: true, debut: prec.fin, fin: p.debut })
    lignes.push(p)
  })
  const cellule = (j, p) => creneaux.filter((c) => c.jour === j && c.debut === p.debut && c.fin === p.fin)
  const court = telephone()
  return (
    <div className="edt-cadre">
      <table className="edt-table">
        <thead>
          <tr>
            <th className="edt-heure">Heure</th>
            {jours.map((j) => (
              <th key={j} className={j === aujourdhui ? 'auj' : ''}>
                {COURTS[j]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((p) =>
            p.pause ? (
              <tr key={`p${p.debut}`} className="edt-pause">
                <td className="edt-heure">
                  <b>{p.debut}</b>
                  <small>{p.fin}</small>
                </td>
                <td colSpan={jours.length}>Pause</td>
              </tr>
            ) : (
              <tr key={`${p.debut}-${p.fin}`}>
                <td className="edt-heure">
                  <b>{p.debut}</b>
                  <small>{p.fin}</small>
                </td>
                {jours.map((j) => {
                  const cours = cellule(j, p)
                  const enCours = j === aujourdhui && m >= minutes(p.debut) && m < minutes(p.fin)
                  return (
                    <td key={j} className={`${j === aujourdhui ? 'auj' : ''} ${cours.length && enCours ? 'en-cours' : ''} ${cours.length ? '' : 'edt-vide'}`}>
                      {cours.map((c) => {
                        const qui = avecClasse ? c.classe : c.last_name ? `${c.first_name} ${c.last_name}` : ''
                        return (
                          <span key={c.id} className="edt-c">
                            <b title={c.matiere || ''}>{court ? matiereCourte(c.matiere || 'Cours') : c.matiere || 'Cours'}</b>
                            {(qui || c.salle) && <small>{[qui, c.salle ? `Salle ${c.salle}` : ''].filter(Boolean).join(' · ')}</small>}
                          </span>
                        )
                      })}
                    </td>
                  )
                })}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
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
              {d.data.creneaux.length ? 'Modifier l’emploi du temps' : 'Saisir l’emploi du temps'}
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

// Un jour de l'emploi du temps, en liste (telephone) : horaires, matiere, classe et salle ; pauses et cours en cours
function JourEmploi({ creneaux, jour }) {
  const maintenant = new Date()
  const m = maintenant.getHours() * 60 + maintenant.getMinutes()
  const auj = maintenant.getDay() === jour
  const liste = creneaux.filter((c) => c.jour === jour).sort((a, b) => minutes(a.debut) - minutes(b.debut))
  if (!liste.length) return <p className="edj-vide">Aucun cours ce jour-là.</p>
  const lignes = []
  liste.forEach((c, i) => {
    const prec = liste[i - 1]
    if (prec && minutes(c.debut) - minutes(prec.fin) >= 10) lignes.push({ pause: true, debut: prec.fin, fin: c.debut })
    lignes.push(c)
  })
  return (
    <ol className="edj-liste">
      {lignes.map((c) =>
        c.pause ? (
          <li key={`p${c.debut}`} className="edj-pause">
            <span>{`${c.debut} – ${c.fin}`}</span>
            <small>Pause</small>
          </li>
        ) : (
          <li key={c.id} className={`edj-cours ${auj && m >= minutes(c.debut) && m < minutes(c.fin) ? 'en-cours' : ''}`}>
            <span className="edj-heure">
              <b>{c.debut}</b>
              <small>{c.fin}</small>
            </span>
            <span className="edj-texte">
              <b data-brut>{c.classe}</b>
              <small>{[c.matiere, c.salle ? `Salle ${c.salle}` : ''].filter(Boolean).join(' · ')}</small>
            </span>
            {auj && m >= minutes(c.debut) && m < minutes(c.fin) && <em className="edj-badge">En cours</em>}
          </li>
        ),
      )}
    </ol>
  )
}

// Emploi du temps de l'enseignant (tous ses cours) : par jour sur telephone, toute la semaine sur ordinateur
export function MonEmploi() {
  const d = useApi('/api/vie-scolaire/emplois/moi')
  const [vue, setVue] = useState(telephone() ? 'jour' : 'semaine')
  const creneaux = d.data?.creneaux || []
  const jours = [1, 2, 3, 4, 5, 6].filter((j) => creneaux.some((c) => c.jour === j))
  const ajd = new Date().getDay()
  const [jour, setJour] = useState(null)
  const actif = jour || (jours.includes(ajd) ? ajd : jours.find((j) => j > ajd) || jours[0])
  const total = creneaux.reduce((s, c) => s + Math.max(0, minutes(c.fin) - minutes(c.debut)), 0)
  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  return (
    <>
      <div className="page-tete">
        <div>
          <h1 className="page-title">Emploi du temps</h1>
          {creneaux.length > 0 && <p className="muted">{`${creneaux.length} cours par semaine · ${Math.floor(total / 60)} h${total % 60 ? ` ${String(total % 60).padStart(2, '0')}` : ''}`}</p>}
        </div>
      </div>
      {creneaux.length > 0 && (
        <div className="segments petit edj-vues" role="tablist">
          <button type="button" role="tab" aria-selected={vue === 'jour'} onClick={() => setVue('jour')}>
            Par jour
          </button>
          <button type="button" role="tab" aria-selected={vue === 'semaine'} onClick={() => setVue('semaine')}>
            Semaine
          </button>
        </div>
      )}
      {vue === 'jour' && creneaux.length > 0 ? (
        <div className="edj-carte">
          <div className="edj-jours" role="tablist" aria-label="Choisir un jour">
            {jours.map((j) => (
              <button key={j} type="button" role="tab" aria-selected={actif === j} onClick={() => setJour(j)}>
                {COURTS[j]}
                {j === ajd && <i aria-label="Aujourd’hui" />}
              </button>
            ))}
          </div>
          <p className="edj-titre">
            <b>{JOURS[actif]}</b>
            <small>{`${creneaux.filter((c) => c.jour === actif).length} cours`}</small>
          </p>
          <JourEmploi creneaux={creneaux} jour={actif} />
        </div>
      ) : (
        <GrilleEmploi creneaux={creneaux} avecClasse />
      )}
    </>
  )
}
