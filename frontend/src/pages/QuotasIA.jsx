import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'

const TYPES = { document: 'Documents du fil', 'liste-eleves': 'Listes d’élèves', frais: 'Frais', discipline: 'Discipline', emploi: 'Emplois du temps', absences: 'Cahiers d’appel' }

// Plafond mensuel de lectures automatiques (IA) : par defaut, et par etablissement
export default function QuotasIA() {
  const d = useApi('/api/ia/admin')
  const [defaut, setDefaut] = useState('')
  const [valeurs, setValeurs] = useState({})
  const [ok, setOk] = useState('')
  const [error, setError] = useState('')
  const data = d.data

  async function enregistrerDefaut() {
    setError('')
    setOk('')
    try {
      await api.put('/api/ia/admin/defaut', { quota: defaut })
      setOk('✓ Plafond par défaut enregistré.')
      setDefaut('')
      d.reload()
    } catch (e) {
      setError(e.message)
    }
  }
  async function enregistrer(ecole) {
    setError('')
    setOk('')
    const v = valeurs[ecole.id]
    try {
      await api.put(`/api/ia/admin/ecoles/${ecole.id}`, { quota: v === undefined ? ecole.quota_ia : v === '' ? null : Number(v) })
      setOk(`✓ Plafond de ${ecole.name} enregistré.`)
      setValeurs((x) => {
        const { [ecole.id]: _, ...reste } = x
        return reste
      })
      d.reload()
    } catch (e) {
      setError(e.message)
    }
  }

  if (!data) return <p className="muted">Chargement…</p>
  return (
    <>
      <h1 className="page-title">Lectures automatiques (IA)</h1>
      <p className="lede">
        Chaque lecture d’un document (PDF, photo) par l’IA coûte quelques francs. Fixez le nombre de lectures par mois dont chaque établissement dispose. L’import Excel / CSV et la saisie à la main ne comptent pas.
      </p>
      <Note kind="ok">{ok}</Note>
      <Note>{error}</Note>

      <div className="card">
        <b>{`Plafond par défaut : ${data.defaut} lectures par mois`}</b>
        <p className="muted" style={{ fontSize: 13, margin: '4px 0 8px' }}>
          S’applique aux établissements sans plafond propre. {data.total} lecture(s) utilisée(s) ce mois, tous établissements confondus.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" inputMode="numeric" placeholder={`Nouveau plafond (ex. ${data.defaut})`} value={defaut} onChange={(e) => setDefaut(e.target.value.replace(/\D/g, ''))} />
          <button type="button" className="btn" disabled={defaut === ''} onClick={enregistrerDefaut}>
            Enregistrer
          </button>
        </div>
      </div>

      <h2 className="section-title">Par établissement</h2>
      <div className="tableau-ordi-cadre">
        <table className="tableau-ordi">
          <thead>
            <tr>
              <th>Établissement</th>
              <th style={{ textAlign: 'right' }}>Ce mois</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th>Plafond mensuel</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.ecoles.map((e) => {
              const pct = e.limite ? Math.min(100, Math.round((e.ce_mois / e.limite) * 100)) : 100
              return (
                <tr key={e.id}>
                  <td>
                    <b>{e.name}</b>
                    <small className="muted" style={{ display: 'block' }}>
                      {e.city || ''}
                      {e.limite === 0 ? ' · désactivé' : ''}
                    </small>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {e.ce_mois} / {e.limite}
                    <span className="ia-barre" style={{ display: 'block', marginTop: 4 }}>
                      <i style={{ width: `${pct}%`, background: pct >= 90 ? '#e5484d' : undefined }} />
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{e.total}</td>
                  <td>
                    <input
                      className="input"
                      style={{ width: 120 }}
                      inputMode="numeric"
                      placeholder={e.parDefaut ? `défaut (${data.defaut})` : ''}
                      value={valeurs[e.id] ?? (e.quota_ia === null ? '' : String(e.quota_ia))}
                      onChange={(x) => setValeurs((v) => ({ ...v, [e.id]: x.target.value.replace(/\D/g, '') }))}
                    />
                  </td>
                  <td>
                    <button type="button" className="btn btn-quiet" style={{ padding: '6px 12px', fontSize: 13 }} disabled={valeurs[e.id] === undefined} onClick={() => enregistrer(e)}>
                      Enregistrer
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '8px 2px' }}>
        Laissez vide pour appliquer le plafond par défaut. Mettez 0 pour désactiver la lecture automatique d’un établissement.
      </p>

      {data.parType.length > 0 && (
        <>
          <h2 className="section-title">Ce mois, par type de document</h2>
          <div className="card">
            {data.parType.map((t) => (
              <div key={t.type} className="compta-ligne">
                <span>{TYPES[t.type] || t.type}</span>
                <b>{t.n}</b>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
