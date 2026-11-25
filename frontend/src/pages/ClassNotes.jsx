import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'
import { IcPlus } from '../icones.jsx'
import { TableauTriable } from '../export.jsx'

const SEQUENCES = [1, 2, 3, 4, 5, 6]
const jour = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '')
const note20 = (n) => (n === null || n === undefined ? '—' : Number(n).toFixed(2).replace('.', ','))

// Les evaluations de la classe en tableau ; une ligne ouvre la saisie des notes
function TableauEvaluations({ evaluations, eleves }) {
  return (
    <TableauTriable
      tableur
      lignes={evaluations}
      onLigne={(e) => (window.location.hash = `/evaluations/${e.id}`)}
      colonnes={[
        { cle: 'sequence', titre: 'Séq.', classe: 'g-num' },
        { cle: 'matiere', titre: 'Matière', classe: 'g-nom' },
        { cle: 'titre', titre: 'Intitulé', rendu: (e) => e.titre || 'Évaluation' },
        { cle: 'date_eval', titre: 'Date', rendu: (e) => jour(e.date_eval) },
        { cle: 'saisies', titre: 'Notes', classe: 'g-num', rendu: (e) => `${e.saisies}/${eleves}` },
        { cle: 'moyenne', titre: 'Moyenne', classe: 'g-num', tri: (e) => e.moyenne ?? -1, rendu: (e) => note20(e.moyenne) },
        { cle: 'publiee', titre: 'État', rendu: (e) => (e.publiee ? <span className="tag tag-now">Publiée</span> : <span className="tag tag-wait">Brouillon</span>) },
      ]}
    />
  )
}

function NouvelleEvaluation({ classId, matieres, onAnnuler }) {
  const [f, setF] = useState({ subjectId: matieres.length === 1 ? String(matieres[0].id) : '', sequence: '1', titre: 'Devoir', date: new Date().toISOString().slice(0, 10), bareme: '20' })
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
      {onAnnuler && (
        <div className="cn-form-tete">
          <b>Nouvelle évaluation</b>
          <button type="button" className="lien-action" onClick={onAnnuler}>
            Annuler
          </button>
        </div>
      )}
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
          <p className="muted" style={{ margin: '0 0 10px' }}>
            {`Moyenne ${note20(d.statistiques.moyenneClasse)} · ${d.statistiques.reussite} % au-dessus de 10 · meilleure ${note20(d.statistiques.plusHaute)} · plus basse ${note20(d.statistiques.plusBasse)}`}
          </p>
          <TableauTriable
            tableur
            lignes={d.eleves}
            colonnes={[
              { cle: 'rang', titre: 'Rang', classe: 'g-num', tri: (e) => e.rang ?? 9999 },
              { cle: 'nom', titre: 'Nom et prénom', classe: 'g-nom', rendu: (e) => `${e.nom} ${e.prenom}` },
              ...[...new Set(d.eleves.flatMap((e) => Object.keys(e.matieres)))].map((sid) => ({
                cle: `m${sid}`,
                titre: matieres.find((m) => String(m.id) === sid)?.name || 'Matière',
                classe: 'g-num',
                tri: (e) => e.matieres[sid] ?? -1,
                rendu: (e) => note20(e.matieres[sid]),
              })),
              {
                cle: 'moyenne',
                titre: 'Moyenne',
                classe: 'g-num',
                tri: (e) => e.moyenne ?? -1,
                rendu: (e) => <b style={{ color: e.moyenne === null ? 'var(--muted)' : e.moyenne >= 10 ? 'var(--ok)' : 'var(--danger)' }}>{note20(e.moyenne)}</b>,
              },
            ]}
          />
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
      <TableauTriable
        tableur
        lignes={matieres}
        colonnes={[
          { cle: 'name', titre: 'Matière', classe: 'g-nom' },
          {
            cle: 'coefficient',
            titre: 'Coefficient',
            classe: modifiable ? 'g-saisie' : 'g-num',
            rendu: (m) =>
              modifiable ? (
                <input aria-label={`Coefficient ${m.name}`} inputMode="decimal" value={v[m.id] ?? '2'} onChange={(e) => setV((x) => ({ ...x, [m.id]: e.target.value }))} />
              ) : (
                String(m.coefficient).replace('.0', '')
              ),
          },
        ]}
      />
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

  if (!etablissement)
    return (
      <>
        <div className="page-tete">
          <div>
            <h1 className="page-title">{`Notes · ${classe.name}`}</h1>
            <p className="muted">{`${classe.eleves} élèves${classe.professeurPrincipal ? ` · prof. principal : ${classe.professeurPrincipal.first_name} ${classe.professeurPrincipal.last_name}` : ''}`}</p>
          </div>
        </div>
        {droits.resultats && (
          <div className="segments petit" role="tablist">
            {[['evaluations', 'Évaluations'], ['resultats', 'Résultats'], ['coefficients', 'Coefficients']].map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={onglet === k} onClick={() => setOnglet(k)}>
                {t}
              </button>
            ))}
          </div>
        )}
        {onglet === 'evaluations' && (
          <>
            {droits.saisie && nouvelle && <NouvelleEvaluation classId={id} matieres={mesMatieres} onAnnuler={() => setNouvelle(false)} />}
            <div className="cn-tete">
              <b>{evaluations.length ? `${evaluations.length} évaluation${evaluations.length > 1 ? 's' : ''}` : 'Évaluations'}</b>
              {droits.saisie && !nouvelle && (
                <button type="button" className="btn cn-nouvelle" onClick={() => setNouvelle(true)}>
                  <IcPlus size={16} />
                  <span>Nouvelle évaluation</span>
                </button>
              )}
            </div>
            {evaluations.length === 0 && <p className="cn-vide">Aucune évaluation pour le moment. Créez la première pour saisir les notes de la classe.</p>}
            {evaluations.length > 0 && <TableauEvaluations evaluations={evaluations} eleves={classe.eleves} />}
          </>
        )}
        {onglet === 'resultats' && <Resultats classId={id} matieres={matieres} />}
        {onglet === 'coefficients' && <Coefficients classId={id} matieres={matieres} modifiable={droits.bulletin} onDone={() => d.reload()} />}
      </>
    )

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
      <div className="segments" role="tablist">
        {[['evaluations', 'Évaluations'], ...(droits.resultats ? [['resultats', 'Résultats'], ['coefficients', 'Coefficients']] : [])].map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={onglet === k} onClick={() => setOnglet(k)}>
            {t}
          </button>
        ))}
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
          {evaluations.length > 0 && <TableauEvaluations evaluations={evaluations} eleves={classe.eleves} />}
        </>
      )}
      {onglet === 'resultats' && (
        <Resultats classId={id} matieres={matieres} />
      )}
      {onglet === 'coefficients' && <Coefficients classId={id} matieres={matieres} modifiable={droits.bulletin} onDone={() => d.reload()} />}
    </>
  )
}
