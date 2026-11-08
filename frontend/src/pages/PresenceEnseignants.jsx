import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { BoutonExcel, exporterExcel } from '../export.jsx'

const aujourdhui = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const ETAT = { assure: ['✓ Appel fait', '#7aa5ff'], sans_appel: ['Pas d’appel', 'var(--danger)'], a_venir: ['À venir', 'var(--muted)'] }

// Presence des enseignants : cours du jour, appels faits, absences signalees, bilan sur 30 jours
export default function PresenceEnseignants() {
  const [date, setDate] = useState(aujourdhui())
  const [onglet, setOnglet] = useState('jour')
  const d = useApi(`/api/presence-enseignants?date=${date}`)
  const [error, setError] = useState('')
  const v = d.data

  async function marquer(teacherId, nom) {
    const motif = window.prompt(`Marquer ${nom} absent(e) ce jour. Motif (facultatif) :`, '')
    if (motif === null) return
    try {
      await api.post('/api/presence-enseignants', { teacherId, date, motif })
      d.reload()
    } catch (err) {
      setError(err.message)
    }
  }
  async function retirer(id) {
    await api.delete(`/api/presence-enseignants/${id}`)
    d.reload()
  }

  const sansAppel = v?.cours.filter((c) => c.etat === 'sans_appel').length || 0
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h1 className="page-title" style={{ flex: 1 }}>
          Présence des enseignants
        </h1>
        {v && (
          <BoutonExcel
            onClick={() =>
              exporterExcel(`presence-enseignants-${date}`, [
                {
                  nom: `Cours du ${date}`,
                  lignes: v.cours.map((c) => ({
                    Heure: `${c.debut}–${c.fin}`,
                    Classe: c.classe,
                    Matière: c.matiere || '',
                    Enseignant: c.last_name ? `${c.last_name} ${c.first_name}` : '',
                    État: c.etat === 'assure' ? 'Appel fait' : c.etat === 'sans_appel' ? 'Pas d’appel' : 'À venir',
                    Absent: c.absent ? 'Oui' : '',
                  })),
                },
                {
                  nom: 'Bilan 30 jours',
                  lignes: v.bilan.map((b) => ({
                    Enseignant: `${b.last_name} ${b.first_name}`,
                    'Cours prévus': b.prevus,
                    'Sans appel': b.sans_appel,
                    'Absences signalées': b.absences,
                    'Taux de cours assurés (%)': b.prevus ? Math.round(((b.prevus - b.sans_appel) / b.prevus) * 100) : 100,
                  })),
                },
              ])
            }
          />
        )}
      </div>
      <div className="chips" style={{ marginBottom: 10 }}>
        <button type="button" className="chip" aria-pressed={onglet === 'jour'} onClick={() => setOnglet('jour')}>
          Jour par jour
        </button>
        <button type="button" className="chip" aria-pressed={onglet === 'bilan'} onClick={() => setOnglet('bilan')}>
          Bilan sur 30 jours
        </button>
      </div>
      <Note>{error || d.error}</Note>
      {!v && !d.error && <p className="muted">Chargement…</p>}
      {v && onglet === 'jour' && (
        <>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ marginBottom: 12 }} />
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <div className="kpi">
              <b>{v.cours.length}</b>
              <span>cours prévus</span>
            </div>
            <div className="kpi">
              <b style={{ color: sansAppel ? 'var(--danger)' : undefined }}>{sansAppel}</b>
              <span>sans appel</span>
            </div>
            <div className="kpi">
              <b style={{ color: v.absences.length ? 'var(--danger)' : undefined }}>{v.absences.length}</b>
              <span>absence(s) signalée(s)</span>
            </div>
          </div>
          {v.absences.length > 0 && (
            <>
              <p className="niveau-titre">Absences signalées</p>
              <ul className="liste-eleves">
                {v.absences.map((a) => (
                  <li key={a.id} style={{ padding: '10px 12px', gap: 10 }}>
                    <span className="nom" style={{ flex: 1 }}>
                      <b>
                        {a.last_name} {a.first_name}
                      </b>
                      <small>
                        {a.par_lui ? 'Signalée par l’enseignant' : 'Marquée par l’administration'}
                        {a.motif ? ` · ${a.motif}` : ''}
                      </small>
                    </span>
                    <button type="button" className="btn btn-quiet" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => retirer(a.id)}>
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="niveau-titre">Cours de la journée</p>
          {v.cours.length === 0 && <p className="muted">Aucun cours prévu ce jour (emplois du temps non saisis, ou jour sans cours).</p>}
          {v.cours.length > 0 && (
            <ul className="liste-eleves">
              {v.cours.map((c) => (
                <li key={c.id} style={{ padding: '10px 12px', gap: 10 }}>
                  <span className="nom" style={{ flex: 1, minWidth: 0 }}>
                    <b>
                      {c.debut} · {c.classe} · {c.matiere || '—'}
                    </b>
                    <small>
                      {c.last_name ? `${c.last_name} ${c.first_name}` : 'Enseignant non affecté'}
                      {c.absent ? ' · absent(e)' : ''}
                    </small>
                  </span>
                  <b style={{ color: ETAT[c.etat][1], fontSize: 12, whiteSpace: 'nowrap' }}>{ETAT[c.etat][0]}</b>
                  {c.teacher_id && !c.absent && c.etat !== 'assure' && (
                    <button type="button" className="btn btn-quiet" style={{ padding: '5px 8px', fontSize: 12 }} onClick={() => marquer(c.teacher_id, `${c.first_name} ${c.last_name}`)}>
                      Absent
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {v && onglet === 'bilan' && (
        <>
          <p className="muted" style={{ fontSize: 14, marginBottom: 10 }}>
            Cours prévus à l’emploi du temps sur les 30 derniers jours, et ceux pour lesquels aucun appel n’a été fait (cours probablement non assurés).
          </p>
          {v.bilan.length === 0 && <p className="muted">Pas encore de données : les emplois du temps doivent être saisis.</p>}
          {v.bilan.length > 0 && (
            <ul className="liste-eleves">
              {v.bilan.map((b) => {
                const taux = b.prevus ? Math.round(((b.prevus - b.sans_appel) / b.prevus) * 100) : 100
                return (
                  <li key={b.teacher_id} style={{ padding: '10px 12px', gap: 10 }}>
                    <span className="nom" style={{ flex: 1 }}>
                      <b>
                        {b.last_name} {b.first_name}
                      </b>
                      <small>
                        {b.prevus} cours prévus · {b.sans_appel} sans appel · {b.absences} absence(s) signalée(s)
                      </small>
                    </span>
                    <b style={{ color: taux >= 90 ? '#7aa5ff' : 'var(--danger)' }}>{taux} %</b>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </>
  )
}
