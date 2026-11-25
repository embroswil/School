import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { BoutonExcel, exporterExcel } from '../export.jsx'

const n2 = (n) => (n === null || n === undefined ? '—' : Number(n).toFixed(2).replace('.', ','))

// Conseil de classe de fin d'annee : moyenne annuelle, rang, decisions
export default function ConseilAnnuel({ id }) {
  const d = useApi(`/api/notes/classes/${id}/annuel`)
  const [dec, setDec] = useState({})
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (d.data) setDec(Object.fromEntries(d.data.eleves.map((e) => [e.id, { decision: e.decision || e.proposition || '', observation: e.observation || '' }])))
  }, [d.data])

  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Calcul…</p>
  const { eleves, stats, decisions, modifiable } = d.data

  // Resultats de fin d'annee en Excel, pour les reporter sur cartescolaire.cm (Minesec) sans ressaisie
  function exporter() {
    exporterExcel(`Conseil-${d.data.classe}`, [
      {
        nom: d.data.classe,
        lignes: eleves.map((e, i) => ({
          'N°': i + 1,
          Matricule: e.matricule,
          Nom: e.nom,
          Prénom: e.prenom,
          Sexe: { male: 'M', female: 'F' }[e.sexe] || e.sexe,
          'Date de naissance': e.naissance ? new Date(e.naissance).toLocaleDateString('fr-FR') : '',
          'Moyenne T1': e.trimestres[0],
          'Moyenne T2': e.trimestres[1],
          'Moyenne T3': e.trimestres[2],
          'Moyenne annuelle': e.annuelle,
          Rang: e.rang,
          Décision: decisions[dec[e.id]?.decision || e.decision || e.proposition] || '',
          Observation: dec[e.id]?.observation ?? e.observation,
        })),
      },
    ])
  }

  async function enregistrer() {
    setError('')
    setOk('')
    setBusy(true)
    try {
      const r = await api.put(`/api/notes/classes/${id}/decisions`, {
        decisions: Object.entries(dec).map(([studentId, v]) => ({ studentId: Number(studentId), ...v })),
      })
      setOk(`${r.data.enregistrees} décision(s) enregistrée(s). Elles apparaissent chez les parents.`)
      d.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h1 className="page-title">Conseil de fin d’année · {d.data.classe}</h1>
        <BoutonExcel onClick={exporter} texte="Excel pour cartescolaire.cm" />
      </div>
      <p className="muted" style={{ margin: '2px 0 10px' }}>
        {`Moyenne de la classe ${n2(stats.moyenneClasse)} · `}
        <b style={{ color: 'var(--ok)' }}>{`${stats.admis} admis`}</b>
        {' · '}
        <b style={{ color: 'var(--danger)' }}>{`${stats.redoublants} redoublent`}</b>
      </p>
      <Note>{error}</Note>
      <Note kind="ok">{ok}</Note>
      {/* tableau facon tableur : une ligne par eleve, decision et observation saisies dans les cellules */}
      <div className="grille-cadre">
        <table className="grille">
          <thead>
            <tr>
              <th>Rang</th>
              <th className="g-nom">Nom et prénom</th>
              <th>Matricule</th>
              <th>T1</th>
              <th>T2</th>
              <th>T3</th>
              <th>Moy. annuelle</th>
              <th>Décision</th>
              <th>Observation</th>
            </tr>
          </thead>
          <tbody>
            {eleves.map((e) => (
              <tr key={e.id}>
                <td className="g-num">{e.rang ?? '—'}</td>
                <td className="g-nom" data-brut>{`${e.nom} ${e.prenom}`}</td>
                <td data-brut>{e.matricule || '—'}</td>
                {e.trimestres.map((t, i) => (
                  <td key={i} className="g-num">{n2(t)}</td>
                ))}
                <td className="g-num" style={{ fontWeight: 800, color: e.annuelle >= 10 ? 'var(--ok)' : e.annuelle ? 'var(--danger)' : 'var(--muted)' }}>{n2(e.annuelle)}</td>
                <td className="g-saisie">
                  {modifiable ? (
                    <select aria-label={`Décision ${e.nom}`} value={dec[e.id]?.decision || ''} onChange={(ev) => setDec((x) => ({ ...x, [e.id]: { ...x[e.id], decision: ev.target.value } }))}>
                      <option value="">—</option>
                      {Object.entries(decisions).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    decisions[e.decision] || '—'
                  )}
                </td>
                <td className="g-saisie">
                  {modifiable ? (
                    <input aria-label={`Observation ${e.nom}`} value={dec[e.id]?.observation || ''} onChange={(ev) => setDec((x) => ({ ...x, [e.id]: { ...x[e.id], observation: ev.target.value } }))} />
                  ) : (
                    e.observation || ''
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modifiable && (
        <button type="button" className="btn btn-block grille-enregistrer" disabled={busy} onClick={enregistrer}>
          {busy ? 'Enregistrement…' : 'Enregistrer les décisions'}
        </button>
      )}
    </>
  )
}
