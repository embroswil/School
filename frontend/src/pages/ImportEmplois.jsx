import { useRef, useState } from 'react'
import { api } from '../api.js'
import { Note } from '../ui.jsx'
import { useDepotPage } from '../depot.jsx'
import { lireDocumentEcole } from '../documents-ecole.js'
import CompteurIA from '../CompteurIA.jsx'
import { comparerClasses } from '../classes.js'

const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

// Emplois du temps par document : une classe, ou toute l'ecole
export default function ImportEmplois() {
  const champ = useRef(null)
  const [lu, setLu] = useState(null)
  const [etat, setEtat] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  async function choisir(e) {
    const f = [...(e.target.files || [])][0]
    e.target.value = ''
    if (!f) return
    setError('')
    setOk('')
    setLu(null)
    try {
      setEtat('Lecture de l’emploi du temps… (jusqu’à une minute)')
      const r = await lireDocumentEcole(f, '/api/documents-ecole/emplois/lire')
      setLu({ classesEcole: [...r.classesEcole].sort((a, b) => comparerClasses(a.name, b.name)), classes: r.classes.map((c, i) => ({ ...c, cle: i, choisi: Boolean(c.classId) })) })
    } catch (err) {
      setError(err.message)
    }
    setEtat('')
  }
  const zoneDepot = useDepotPage(choisir, { texte: 'Déposez l’emploi du temps', detail: 'PDF, photo, Excel ou CSV' })
  const maj = (cle, champs) => setLu((l) => ({ ...l, classes: l.classes.map((c) => (c.cle === cle ? { ...c, ...champs } : c)) }))

  async function appliquer() {
    const choisis = lu.classes.filter((c) => c.choisi && c.classId)
    setBusy(true)
    setError('')
    try {
      const r = (await api.post('/api/documents-ecole/emplois/appliquer', { classes: choisis.map((c) => ({ classId: c.classId, creneaux: c.creneaux })) })).data
      setOk(`✓ Emploi du temps enregistré pour ${r.classes} classe(s) : ${r.cours} cours.`)
      setLu(null)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const nb = lu ? lu.classes.filter((c) => c.choisi && c.classId).length : 0
  return (
    <>
      {zoneDepot}
      <h1 className="page-title">Emplois du temps</h1>
      <CompteurIA />
      <p className="lede">Importez l’emploi du temps d’une classe, ou de plusieurs classes à la fois. Il remplace l’emploi du temps actuel de chaque classe choisie ; l’appel, la présence des enseignants et le suivi des parents s’en servent.</p>
      <input ref={champ} type="file" hidden accept=".pdf,.xlsx,.xls,.csv,image/*" onChange={choisir} />
      <button type="button" className="depot" onClick={() => champ.current?.click()} disabled={Boolean(etat)}>
        <span style={{ fontSize: 34 }}>🗓️</span>
        <b>{etat || 'Choisir l’emploi du temps'}</b>
        <small>PDF, photo, Excel ou CSV</small>
        <small className="astuce-depot">ou glissez-déposez le fichier n’importe où sur cette page</small>
      </button>
      <Note kind="ok">{ok}</Note>
      <Note>{error}</Note>
      {lu &&
        lu.classes.map((c) => (
          <div key={c.cle} className="card" style={{ marginTop: 12 }}>
            <label className="check" style={{ margin: 0, alignItems: 'center' }}>
              <input type="checkbox" checked={c.choisi && Boolean(c.classId)} disabled={!c.classId} onChange={(e) => maj(c.cle, { choisi: e.target.checked })} />
              <b style={{ flex: 1 }}>
                {c.nomLu || 'Classe non indiquée'} · {c.creneaux.length} cours
              </b>
            </label>
            <div style={{ margin: '8px 0' }}>
              <select className="input" value={c.classId || ''} onChange={(e) => maj(c.cle, { classId: Number(e.target.value) || null, choisi: Boolean(e.target.value) })}>
                <option value="">{c.classId ? '' : 'Choisir la classe de l’établissement…'}</option>
                {lu.classesEcole.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="tableau-ordi-cadre" style={{ maxHeight: 260, overflow: 'auto' }}>
              <table className="tableau-ordi">
                <tbody>
                  {[...c.creneaux]
                    .sort((a, b) => a.jour - b.jour || a.debut.localeCompare(b.debut))
                    .map((k, i) => (
                      <tr key={i}>
                        <td>{JOURS[k.jour]}</td>
                        <td>
                          {k.debut}–{k.fin}
                        </td>
                        <td>
                          <b>{k.matiere}</b>
                        </td>
                        <td className="muted">{k.salle}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      {lu && (
        <div className="actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={appliquer} disabled={busy || !nb}>
            {busy ? 'Enregistrement…' : `Enregistrer pour ${nb} classe(s)`}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setLu(null)}>
            Annuler
          </button>
        </div>
      )}
    </>
  )
}
