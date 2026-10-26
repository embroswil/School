import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'

const SEQUENCES = [1, 2, 3, 4, 5, 6]
const jour = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '')
const note20 = (n) => (n === null || n === undefined ? '—' : Number(n).toFixed(2).replace('.', ','))

function NouvelleEvaluation({ classId, matieres }) {
  const [f, setF] = useState({ subjectId: '', sequence: '1', titre: 'Devoir', date: new Date().toISOString().slice(0, 10), bareme: '20' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  async function creer(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await api.post('/api/notes/evaluations', { ...f, classId })
      window.location.hash = `/evaluations/${r.data.id}`
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <form className="card" onSubmit={creer} style={{ marginBottom: 14 }}>
      <Field label="Matière">
        <select className="input" value={f.subjectId} onChange={maj('subjectId')} required>
          <option value="">Choisir la matière</option>
          {matieres.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      <span className="field-label">Séquence</span>
      <div className="chips">
        {SEQUENCES.map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={f.sequence === String(s)} onClick={() => setF((x) => ({ ...x, sequence: String(s) }))}>
            Séq. {s}
          </button>
        ))}
      </div>
      <div className="grid2">
        <Field label="Intitulé">
          <input className="input" value={f.titre} onChange={maj('titre')} />
        </Field>
        <Field label="Noté sur">
          <input className="input" inputMode="decimal" value={f.bareme} onChange={maj('bareme')} />
        </Field>
      </div>
      <Field label="Date">
        <input className="input" type="date" value={f.date} onChange={maj('date')} />
      </Field>
      <Note>{error}</Note>
      <button className="btn btn-block" type="submit" disabled={busy}>
        {busy ? 'Création…' : 'Créer et saisir les notes'}
      </button>
    </form>
  )
}

function Resultats({ classId, matieres }) {
  const [periode, setPeriode] = useState('sequence=1')
  const r = useApi(`/api/notes/classes/${classId}/resultats?${periode}`)
  const d = r.data
  const nomMatiere = Object.fromEntries(matieres.map((m) => [m.id, m.name]))
  const [ouvert, setOuvert] = useState(null)
  return (
    <>
      <div className="chips">
        {SEQUENCES.map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={periode === `sequence=${s}`} onClick={() => setPeriode(`sequence=${s}`)}>
            Séq. {s}
          </button>
        ))}
        {[1, 2, 3].map((t) => (
          <button key={t} type="button" className="chip" aria-pressed={periode === `trimestre=${t}`} onClick={() => setPeriode(`trimestre=${t}`)}>
            Trim. {t}
          </button>
        ))}
        <button type="button" className="chip" aria-pressed={periode === 'annee=1'} onClick={() => setPeriode('annee=1')}>
          Année
        </button>
      </div>
      {r.loading && <p className="muted">Calcul…</p>}
      {d && d.statistiques.classes === 0 && <p className="muted">Aucune note saisie pour cette période.</p>}
      {d && d.statistiques.classes > 0 && (
        <>
          <div className="stats" style={{ marginTop: 0, marginBottom: 14 }}>
            <div className="stat">
              <b>{note20(d.statistiques.moyenneClasse)}</b>
              <span>moyenne</span>
            </div>
            <div className="stat">
              <b>{d.statistiques.reussite}%</b>
              <span>≥ 10/20</span>
            </div>
            <div className="stat">
              <b>{note20(d.statistiques.plusHaute)}</b>
              <span>meilleure</span>
            </div>
            <div className="stat">
              <b>{note20(d.statistiques.plusBasse)}</b>
              <span>plus basse</span>
            </div>
          </div>
          <ul className="rows">
            {d.eleves.map((e) => (
              <li key={e.id} style={{ borderTop: '1px solid var(--line)' }}>
                <button
                  type="button"
                  className="row"
                  style={{ width: '100%', border: 0, background: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
                  onClick={() => setOuvert(ouvert === e.id ? null : e.id)}
                >
                  <span style={{ width: 34, fontWeight: 800, color: e.rang <= 3 ? 'var(--primary)' : 'var(--muted)' }}>{e.rang ? `${e.rang}e` : '—'}</span>
                  <div className="row-main">
                    <div className="row-title">
                      {e.nom} {e.prenom}
                    </div>
                  </div>
                  <b style={{ color: e.moyenne === null ? 'var(--muted)' : e.moyenne >= 10 ? 'var(--ok)' : 'var(--danger)' }}>{note20(e.moyenne)}</b>
                </button>
                {ouvert === e.id && (
                  <div style={{ padding: '0 16px 12px 62px', fontSize: 14 }}>
                    {Object.entries(e.matieres).map(([sid, m]) => (
                      <div key={sid} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="muted">{nomMatiere[sid] || 'Matière'}</span>
                        <b>{note20(m)}</b>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function Coefficients({ classId, matieres, onDone, modifiable }) {
  const [v, setV] = useState(() => Object.fromEntries(matieres.map((m) => [m.id, String(m.coefficient)])))
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  async function enregistrer() {
    setBusy(true)
    setOk('')
    await api.put(`/api/notes/classes/${classId}/coefficients`, { coefficients: v })
    setOk('Coefficients enregistrés.')
    setBusy(false)
    onDone()
  }
  return (
    <>
      <p className="muted" style={{ marginBottom: 10 }}>
        Les coefficients servent au calcul de la moyenne générale et du rang.
      </p>
      <ul className="rows">
        {matieres.map((m) => (
          <li className="row" key={m.id}>
            <div className="row-main">
              <div className="row-title">{m.name}</div>
            </div>
            {modifiable ? (
              <input
                className="input"
                style={{ width: 70, padding: '8px 10px', textAlign: 'center' }}
                inputMode="decimal"
                value={v[m.id] ?? '2'}
                onChange={(e) => setV((x) => ({ ...x, [m.id]: e.target.value }))}
              />
            ) : (
              <b>coef. {String(m.coefficient).replace('.0', '')}</b>
            )}
          </li>
        ))}
      </ul>
      <Note kind="ok">{ok}</Note>
      {modifiable ? (
        <button type="button" className="btn btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={enregistrer}>
          {busy ? 'Enregistrement…' : 'Enregistrer les coefficients'}
        </button>
      ) : (
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          Les coefficients sont fixés par le professeur principal de la classe.
        </p>
      )}
    </>
  )
}

// Notes d'une classe : evaluations par sequence, resultats et coefficients
export default function ClassNotes({ id }) {
  const { user } = useAuth()
  const etablissement = user.role !== 'teacher'
  // Prepare la liste des matieres de l'etablissement (creee au premier passage)
  const [pret, setPret] = useState(!etablissement)
  useEffect(() => {
    if (etablissement) api.get('/api/etablissement/matieres').finally(() => setPret(true))
  }, [etablissement])
  const d = useApi(pret ? `/api/notes/classes/${id}` : null)
  // Onglet demande dans l'adresse (ex. #/classes/3/notes?onglet=resultats)
  const ongletDemande = new URLSearchParams(window.location.hash.split('?')[1] || '').get('onglet')
  const [onglet, setOnglet] = useState(['resultats', 'coefficients'].includes(ongletDemande) ? ongletDemande : 'evaluations')
  const [nouvelle, setNouvelle] = useState(false)

  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const { classe, matieres, evaluations, droits } = d.data
  const mesMatieres = matieres.filter((m) => droits.mesMatieres.includes(m.id))

  return (
    <>
      <h1 className="page-title">Notes · {classe.name}</h1>
      <p className="lede">
        {classe.eleves} élèves · 6 séquences (2 par trimestre)
        {classe.professeurPrincipal ? ` · prof. principal : ${classe.professeurPrincipal.first_name} ${classe.professeurPrincipal.last_name}` : ''}
      </p>
      {!droits.saisie && !droits.bulletin && (
        <div className="note note-ok" style={{ fontWeight: 400 }}>
          Consultation : les notes sont publiées par les enseignants de la classe.
        </div>
      )}
      <div className="chips">
        <button type="button" className="chip" aria-pressed={onglet === 'evaluations'} onClick={() => setOnglet('evaluations')}>
          📝 Évaluations
        </button>
        {droits.resultats && (
          <>
            <button type="button" className="chip" aria-pressed={onglet === 'resultats'} onClick={() => setOnglet('resultats')}>
              🏆 Résultats
            </button>
            <button type="button" className="chip" aria-pressed={onglet === 'coefficients'} onClick={() => setOnglet('coefficients')}>
              ⚖️ Coefficients
            </button>
          </>
        )}
      </div>

      {onglet === 'evaluations' && (
        <>
          {droits.saisie &&
            (nouvelle ? (
              <NouvelleEvaluation classId={id} matieres={mesMatieres} />
            ) : (
              <button type="button" className="btn btn-block" style={{ marginBottom: 14 }} onClick={() => setNouvelle(true)}>
                + Nouvelle évaluation
              </button>
            ))}
          {evaluations.length === 0 && <p className="muted">Aucune évaluation pour le moment.</p>}
          {evaluations.length > 0 && (
            <ul className="rows">
              {evaluations.map((e) => (
                <a className="row" key={e.id} href={`#/evaluations/${e.id}`}>
                  <span className="tag" style={{ minWidth: 52, textAlign: 'center' }}>
                    Séq. {e.sequence}
                  </span>
                  <div className="row-main">
                    <div className="row-title">{e.matiere}</div>
                    <div className="row-sub">
                      {e.titre} · {jour(e.date_eval)} · {e.saisies}/{classe.eleves} notes
                      {e.moyenne !== null ? ` · moy. ${note20(e.moyenne)}` : ''}
                    </div>
                  </div>
                  {e.publiee ? <span className="tag tag-now">Publiée</span> : <span className="tag tag-wait">Brouillon</span>}
                </a>
              ))}
            </ul>
          )}
        </>
      )}
      {onglet === 'resultats' && <Resultats classId={id} matieres={matieres} />}
      {onglet === 'coefficients' && <Coefficients classId={id} matieres={matieres} modifiable={droits.bulletin} onDone={() => d.reload()} />}
    </>
  )
}
