import { useRef, useState } from 'react'
import { api } from '../api.js'
import { Note } from '../ui.jsx'
import { preparerDocument } from '../lecture-fichier.js'
import { TYPES_SANCTION } from './Discipline.jsx'

// Discipline par document : photo ou fichier (PV de conseil de discipline,
// liste de sanctions, rapport…) lu automatiquement, eleves reconnus, puis verification.
export default function DisciplineImport() {
  const appareil = useRef(null)
  const champ = useRef(null)
  const [entrees, setEntrees] = useState(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState('')

  async function lire(e) {
    const fichiers = [...(e.target.files || [])]
    e.target.value = ''
    if (!fichiers.length) return
    setError('')
    setOk('')
    setEntrees(null)
    setBusy('Lecture du document… (jusqu’à une minute)')
    try {
      const doc = await preparerDocument(fichiers)
      const r = await api.post('/api/vie-scolaire/sanctions/lire', doc)
      if (!r.data.length) throw new Error('Aucune sanction trouvée dans ce document.')
      setEntrees(r.data.map((x) => ({ ...x, studentId: x.eleve?.id || '', garder: Boolean(x.eleve) })))
    } catch (err) {
      setError(err.message)
    }
    setBusy('')
  }

  const maj = (i, k, v) => setEntrees((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  async function enregistrer() {
    setError('')
    setBusy('Enregistrement…')
    let faits = 0
    const erreurs = []
    for (const x of entrees.filter((y) => y.garder && y.studentId)) {
      try {
        await api.post('/api/vie-scolaire/sanctions', {
          studentId: Number(x.studentId),
          type: x.type,
          motif: x.motif || TYPES_SANCTION[x.type],
          date: x.date,
          dureeJours: x.dureeJours,
        })
        faits++
      } catch (err) {
        erreurs.push(`${x.nomLu} : ${err.message}`)
      }
    }
    setBusy('')
    setOk(`${faits} sanction(s) enregistrée(s). Les parents concernés sont prévenus.`)
    if (erreurs.length) setError(erreurs.join(' · '))
    setEntrees(null)
  }

  const retenues = (entrees || []).filter((x) => x.garder && x.studentId).length

  return (
    <>
      <h1 className="page-title">Discipline par document</h1>
      <p className="lede">
        Photographiez ou envoyez un document disciplinaire (procès-verbal du conseil de discipline, liste de sanctions, rapport…), imprimé
        ou écrit à la main. Les élèves sont reconnus automatiquement ; vous vérifiez avant d’enregistrer.
      </p>
      <div className="grid2">
        <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => appareil.current?.click()}>
          📷 Photographier
        </button>
        <button type="button" className="btn btn-quiet" disabled={Boolean(busy)} onClick={() => champ.current?.click()}>
          📄 Fichier
        </button>
      </div>
      <input ref={appareil} type="file" hidden accept="image/*" capture="environment" multiple onChange={lire} />
      <input ref={champ} type="file" hidden multiple accept=".pdf,.xlsx,.xls,.csv,.ods,image/*" onChange={lire} />
      {busy && <p className="muted" style={{ marginTop: 10 }}>{busy}</p>}
      <Note>{error}</Note>
      <Note kind="ok">{ok}</Note>

      {entrees && (
        <>
          <h2 className="section-title">
            {entrees.length} élément(s) lu(s) · {retenues} à enregistrer
          </h2>
          {entrees.map((x, i) => (
            <div className="card" key={i} style={{ opacity: x.garder ? 1 : 0.5 }}>
              <label className="check" style={{ margin: '0 0 8px' }}>
                <input type="checkbox" checked={x.garder} onChange={(e) => maj(i, 'garder', e.target.checked)} />
                <span>
                  Lu : <b>{x.nomLu}</b>
                  {x.classeLue ? ` (${x.classeLue})` : ''}
                </span>
              </label>
              <select className="input" value={x.studentId} onChange={(e) => maj(i, 'studentId', e.target.value)} style={{ marginBottom: 8, borderColor: x.studentId ? undefined : 'var(--danger)' }}>
                <option value="">{x.suggestions.length ? 'Choisir l’élève…' : 'Élève non retrouvé'}</option>
                {x.suggestions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom} {s.classe ? `· ${s.classe}` : ''}
                  </option>
                ))}
              </select>
              <div className="grid2">
                <select className="input" value={x.type} onChange={(e) => maj(i, 'type', e.target.value)}>
                  {Object.entries(TYPES_SANCTION).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <input className="input" type="date" value={x.date} onChange={(e) => maj(i, 'date', e.target.value)} />
              </div>
              <input className="input" value={x.motif} placeholder="Motif" onChange={(e) => maj(i, 'motif', e.target.value)} style={{ marginTop: 8 }} />
            </div>
          ))}
          <button type="button" className="btn btn-block" disabled={Boolean(busy) || !retenues} onClick={enregistrer} style={{ marginTop: 6 }}>
            Enregistrer {retenues} sanction(s)
          </button>
        </>
      )}
    </>
  )
}
