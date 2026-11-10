import { useRef, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'
import { useDepotPage } from '../depot.jsx'
import { lireDocumentEcole } from '../documents-ecole.js'
import { trierClasses } from '../classes.js'

// Cahiers d'appel : l'administration depose le cahier, School met a jour les absences
export default function ImportAbsences() {
  const champ = useRef(null)
  const classes = trierClasses(useApi('/api/etablissement/classes').data || [])
  const [classId, setClassId] = useState('')
  const [lignes, setLignes] = useState(null)
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
    setLignes(null)
    try {
      setEtat('Lecture du cahier d’appel… (jusqu’à une minute)')
      setLignes(await lireDocumentEcole(f, '/api/documents-ecole/absences/lire', classId ? { classId: Number(classId) } : {}))
    } catch (err) {
      setError(err.message)
    }
    setEtat('')
  }
  const zoneDepot = useDepotPage(choisir, { texte: 'Déposez le cahier d’appel', detail: 'PDF, photo, Excel ou CSV' })

  async function appliquer() {
    setBusy(true)
    setError('')
    try {
      const r = (await api.post('/api/documents-ecole/absences/appliquer', { absences: lignes.filter((l) => l.trouve) })).data
      setOk(`✓ ${r.ajoutees} absence(s) ajoutée(s)${r.dejaLa ? `, ${r.dejaLa} déjà enregistrée(s) par l’appel des enseignants (non modifiées)` : ''}.`)
      setLignes(null)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const trouvees = lignes ? lignes.filter((l) => l.trouve).length : 0
  const perdues = lignes ? lignes.length - trouvees : 0
  return (
    <>
      {zoneDepot}
      <h1 className="page-title">Cahier d’appel</h1>
      <p className="lede">Les absences sont faites par les enseignants à l’appel. Déposez ici les cahiers d’appel (papier photographié, PDF ou Excel) pour compléter ou mettre à jour les absences : celles déjà saisies par un enseignant ne sont pas modifiées.</p>
      <Field label="Classe du cahier (si le document ne l’indique pas)">
        <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Indiquée dans le document</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <input ref={champ} type="file" hidden accept=".pdf,.xlsx,.xls,.csv,image/*" onChange={choisir} />
      <button type="button" className="depot" onClick={() => champ.current?.click()} disabled={Boolean(etat)}>
        <span style={{ fontSize: 34 }}>📒</span>
        <b>{etat || 'Choisir le cahier d’appel'}</b>
        <small>Photo, PDF, Excel ou CSV</small>
        <small className="astuce-depot">ou glissez-déposez le fichier n’importe où sur cette page</small>
      </button>
      <Note kind="ok">{ok}</Note>
      <Note>{error}</Note>
      {lignes && (
        <>
          <h2 className="section-title">
            {trouvees} absence(s) reconnue(s){perdues ? ` · ${perdues} non reconnue(s)` : ''}
          </h2>
          <div className="tableau-ordi-cadre" style={{ maxHeight: 420, overflow: 'auto' }}>
            <table className="tableau-ordi">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Élève</th>
                  <th>Classe</th>
                  <th>Heure</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lignes.slice(0, 500).map((l, i) => (
                  <tr key={i}>
                    <td>{l.date ? new Date(l.date).toLocaleDateString('fr-FR') : '?'}</td>
                    <td>{l.nom}</td>
                    <td>{l.classe}</td>
                    <td>{l.heure || 'Journée'}</td>
                    <td>{l.trouve ? <span style={{ color: '#5fd0a0' }}>✓</span> : <span style={{ color: '#ff7a82' }}>Non reconnu</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {perdues > 0 && <Note>Les élèves « non reconnus » ne sont pas importés : vérifiez l’orthographe, ou choisissez la classe du cahier ci-dessus et relancez.</Note>}
          <div className="actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={appliquer} disabled={busy || !trouvees}>
              {busy ? 'Enregistrement…' : `Enregistrer ${trouvees} absence(s)`}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setLignes(null)}>
              Annuler
            </button>
          </div>
        </>
      )}
    </>
  )
}
