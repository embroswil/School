import { useRef, useState } from 'react'
import { api } from '../api.js'
import { Note } from '../ui.jsx'
import { useDepotPage } from '../depot.jsx'
import { lireDocumentEcole } from '../documents-ecole.js'
import CompteurIA from '../CompteurIA.jsx'
import { comparerClasses } from '../classes.js'
import { IcImport } from '../icones.jsx'

const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

// Emplois du temps par document : une classe, ou toute l'ecole
export default function ImportEmplois() {
  const champ = useRef(null)
  const [lu, setLu] = useState(null)
  const [etat, setEtat] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [progres, setProgres] = useState(null) // { fait, total }

  async function choisir(e) {
    const f = [...(e.target.files || [])][0]
    e.target.value = ''
    if (!f) return
    setError('')
    setOk('')
    setLu(null)
    try {
      setEtat('Lecture en cours…')
      const r = await lireDocumentEcole(f, '/api/documents-ecole/emplois/lire')
      if (!r || !Array.isArray(r.classes) || !r.classes.length) throw new Error('Aucun cours trouvé dans ce document.')
      setLu({
        classesEcole: [...(r.classesEcole || [])].sort((a, b) => comparerClasses(a.name, b.name)),
        classes: r.classes.map((c, i) => ({ ...c, creneaux: c.creneaux || [], cle: i, choisi: Boolean(c.classId) })),
      })
    } catch (err) {
      setError(err.message)
    }
    setEtat('')
  }
  const zoneDepot = useDepotPage(choisir, { texte: 'Déposez l’emploi du temps', detail: 'Excel, PDF, Word ou photo' })
  // l peut etre vide (import termine ou annule pendant un choix) : on ne touche alors a rien
  const maj = (cle, champs) => setLu((l) => (l ? { ...l, classes: l.classes.map((c) => (c.cle === cle ? { ...c, ...champs } : c)) } : l))

  // Enregistrement par paquets de 8 classes, avec l'avancement affiche
  async function appliquer() {
    const choisis = lu.classes.filter((c) => c.choisi && c.classId)
    setBusy(true)
    setError('')
    let classes = 0
    let cours = 0
    setProgres({ fait: 0, total: choisis.length })
    try {
      for (let i = 0; i < choisis.length; i += 8) {
        const lot = choisis.slice(i, i + 8)
        const r = (await api.post('/api/documents-ecole/emplois/appliquer', { classes: lot.map((c) => ({ classId: c.classId, creneaux: c.creneaux })) })).data
        classes += r?.classes ?? 0
        cours += r?.cours ?? 0
        setProgres({ fait: Math.min(i + 8, choisis.length), total: choisis.length })
      }
      setOk(`Emploi du temps enregistré pour ${classes} classe(s) : ${cours} cours.`)
      setLu(null)
      window.scrollTo(0, 0)
    } catch (err) {
      setError(classes ? `${err.message} — ${classes} classe(s) déjà enregistrée(s) : relancez pour terminer.` : err.message)
    }
    setProgres(null)
    setBusy(false)
  }

  const nb = lu ? lu.classes.filter((c) => c.choisi && c.classId).length : 0
  return (
    <>
      {zoneDepot}
      <h1 className="page-title">Emplois du temps</h1>
      <CompteurIA discret />
      <input ref={champ} type="file" hidden accept=".pdf,.xlsx,.xls,.csv,.docx,image/*" onChange={choisir} />
      <button type="button" className="import-zone" style={{ marginTop: 10 }} onClick={() => champ.current?.click()} disabled={Boolean(etat)}>
        <IcImport size={22} />
        <b>{etat || 'Choisir un fichier ou une photo'}</b>
        <small>{etat ? 'Jusqu’à une minute' : 'Excel, PDF, Word ou photo · une ou plusieurs classes'}</small>
      </button>
      <p className="muted" style={{ fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>
        L’emploi du temps importé remplace celui de chaque classe choisie.
      </p>
      <Note kind="ok">{ok}</Note>
      <Note>{error}</Note>
      {lu && (
        <>
          <div className="edt-barre">
            <div>
              <b>{`${lu.classes.length} classe(s) lue(s)`}</b>
              <small>{`${lu.classes.reduce((t, c) => t + c.creneaux.length, 0)} cours · ${lu.classes.filter((c) => !c.classId).length} à associer`}</small>
            </div>
            <button type="button" className="btn" onClick={appliquer} disabled={busy || !nb}>
              {busy ? 'Enregistrement…' : `Enregistrer ${nb} classe(s)`}
            </button>
          </div>
          {progres && (
            <div className="edt-progres">
              <span className="suivi-barre" aria-hidden="true">
                <i style={{ width: `${Math.round((progres.fait / progres.total) * 100)}%` }} />
              </span>
              <small>{`${progres.fait} / ${progres.total} classes · ${Math.round((progres.fait / progres.total) * 100)} %`}</small>
            </div>
          )}
          <ul className="edt-liste">
            {lu.classes.map((c) => (
              <li key={c.cle} className={c.classId ? '' : 'a-associer'}>
                <div className="edt-ligne">
                  <input type="checkbox" checked={c.choisi && Boolean(c.classId)} disabled={!c.classId || busy} onChange={(e) => maj(c.cle, { choisi: e.target.checked })} aria-label={c.nomLu || 'Classe'} />
                  <span className="ls-texte">
                    <b data-brut>{c.classId ? lu.classesEcole.find((k) => k.id === c.classId)?.name || c.nomLu : c.nomLu || 'Classe non indiquée'}</b>
                    <small>{`${c.creneaux.length} cours`}</small>
                  </span>
                  {!c.classId && (
                    <select className="input" value="" onChange={(e) => maj(c.cle, { classId: Number(e.target.value) || null, choisi: Boolean(e.target.value) })}>
                      <option value="">Associer…</option>
                      {lu.classesEcole.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <details className="edt-details">
                  <summary>Voir les cours</summary>
                  <table className="edt-table">
                    <tbody>
                      {[...c.creneaux]
                        .sort((a, b) => a.jour - b.jour || String(a.debut).localeCompare(String(b.debut)))
                        .map((k, n) => (
                          <tr key={n}>
                            <td>{JOURS[k.jour]?.slice(0, 3)}</td>
                            <td className="edt-heure">{`${k.debut}–${k.fin}`}</td>
                            <td>{k.matiere}</td>
                            <td className="muted">{k.salle}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </details>
              </li>
            ))}
          </ul>
          <div className="actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setLu(null)}>
              Annuler
            </button>
          </div>
        </>
      )}
    </>
  )
}
