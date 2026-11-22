import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { copieProche, mettreEnAttente, retirerAttente } from '../horsligne.js'
import { IcCalendrier, IcCoche } from '../icones.jsx'

// Seules les absences sont enregistrees
const STATUTS = [
  ['present', 'P', 'Présent', '#2f6bff'],
  ['absent', 'A', 'Absent', 'var(--danger)'],
]

// Date du jour sur le telephone (et non en temps universel)
const aujourdhui = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const maintenantHHMM = () => {
  const d = new Date()
  return d.getHours() * 100 + d.getMinutes()
}

// Cours choisi depuis la presence des enseignants (appel fait a la place d'un enseignant absent)
export const demandeAppel = { date: null, periode: null }

// Appel d'une classe pour un jour : tout le monde present par defaut, on touche les absents
export default function Appel({ id }) {
  const [demande] = useState(() => {
    const x = { ...demandeAppel }
    demandeAppel.date = null
    demandeAppel.periode = null
    return x
  })
  const [date, setDate] = useState(demande.date || aujourdhui())
  const [auto, setAuto] = useState(demande.periode === null) // choisir le cours en cours automatiquement
  const [periode, setPeriode] = useState(demande.periode) // heure du cours (ex. 730) ; null : la journee
  const chemin = `/api/notes/appel/${id}?date=${date}${periode !== null ? `&periode=${periode}` : ''}`
  const enLigne = useApi(chemin)
  // sans reseau et sans copie de ce jour : la liste de la classe gardee lors d'un appel precedent
  const { data: donnees, sansReseau } = enLigne
  const secours = useMemo(() => {
    if (donnees || !sansReseau) return null
    const p = copieProche(`/api/notes/appel/${id}?`)
    if (!p?.data?.eleves) return null
    const jourDe = (x) => new Date(`${x}T12:00:00`).getDay()
    const datePrise = new URLSearchParams(p.path.split('?')[1]).get('date')
    const memeJour = datePrise && jourDe(datePrise) === jourDe(date)
    return {
      le: p.le,
      data: {
        ...p.data,
        faite: false,
        eleves: p.data.eleves.map((e) => ({ ...e, status: null })),
        cours: memeJour ? (p.data.cours || []).map((c) => ({ ...c, fait: false })) : [],
      },
    }
  }, [donnees, sansReseau, id, date])
  const d = secours ? { ...enLigne, data: secours.data, error: '', horsLigne: secours.le } : enLigne
  const [statuts, setStatuts] = useState({})
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (d.data) setStatuts(Object.fromEntries(d.data.eleves.map((e) => [e.id, e.status || 'present'])))
  }, [d.data])

  // Enseignant : selectionne d'office le cours en cours (ou le prochain non fait) de l'emploi du temps
  useEffect(() => {
    // (pas pendant le chargement : la liste affichee est encore celle du jour precedent)
    if (!auto || d.loading || !d.data?.modifiable || periode !== null || !d.data.cours?.length) return
    setAuto(false)
    const t = maintenantHHMM()
    const enCours = d.data.cours.find((c) => Number(c.debut.replace(':', '')) <= t && t < Number(c.fin.replace(':', '')))
    const suivant = d.data.cours.find((c) => !c.fait)
    const choix = enCours || suivant || d.data.cours[d.data.cours.length - 1]
    if (choix) setPeriode(choix.periode)
  }, [d.data, d.loading, auto, periode])

  async function enregistrer() {
    setError('')
    setOk('')
    setBusy(true)
    const corps = { date, periode, presences: Object.entries(statuts).map(([sid, statut]) => ({ studentId: Number(sid), statut })) }
    const cle = `appel|${id}|${date}|${periode ?? 'jour'}`
    try {
      const r = await api.put(`/api/notes/appel/${id}`, corps)
      retirerAttente(cle) // un appel garde sans reseau ne doit pas remplacer celui-ci plus tard
      const d = r.data || {}
      setOk(
        `Appel enregistré.${
          d.parentsPrevenus ? ` ${d.parentsPrevenus} parent${d.parentsPrevenus > 1 ? 's' : ''} prévenu${d.parentsPrevenus > 1 ? 's' : ''} de l’absence.` : d.absentsSignales ? ' Aucun parent inscrit pour ces absents.' : ''
        }`,
      )
      d.reload()
    } catch (err) {
      if (err.status === 0) {
        const cours = d.data?.cours?.find((c) => c.periode === periode)
        const libelle = `Appel ${d.data?.classe || ''}${cours ? ` de ${cours.debut}` : ''}`.trim()
        if (mettreEnAttente({ cle, path: `/api/notes/appel/${id}`, body: corps, libelle })) {
          setOk('Pas de réseau : l’appel est gardé sur le téléphone. Il sera envoyé automatiquement dès le retour du réseau.')
        } else setError(err.message)
      } else setError(err.message)
    }
    setBusy(false)
  }

  const compte = (s) => Object.values(statuts).filter((x) => x === s).length
  const modif = d.data?.modifiable

  const changerDate = (v) => {
    setDate(v)
    setPeriode(null)
    setAuto(true)
  }
  const dateLongue = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  // Enseignant : appel de son cours
  if (modif)
    return (
      <div className="ap-page">
        <div className="page-tete">
          <div>
            <h1 className="page-title">{`Appel · ${d.data.classe}`}</h1>
            <p className="muted ap-date">{date === aujourdhui() ? `Aujourd’hui · ${dateLongue}` : dateLongue}</p>
          </div>
          <label className="ap-calendrier" aria-label="Changer de jour">
            <IcCalendrier size={18} />
            <input type="date" value={date} max={aujourdhui()} onChange={(e) => e.target.value && changerDate(e.target.value)} />
          </label>
        </div>
        {d.data.cours?.length > 0 ? (
          <div className="ap-cours" role="tablist" aria-label="Cours">
            {d.data.cours.map((c) => (
              <button key={c.periode} type="button" role="tab" aria-selected={periode === c.periode} onClick={() => setPeriode(c.periode)}>
                <b>{c.debut}</b>
                <small>{c.matiere || 'Cours'}</small>
                {c.fait && <IcCoche size={13} />}
              </button>
            ))}
          </div>
        ) : (
          <p className="ap-info">Pas d’emploi du temps pour ce jour : l’appel vaut pour toute la journée.</p>
        )}
        <div className="ap-chiffres">
          <div>
            <b>{compte('present')}</b>
            <small>Présents</small>
          </div>
          <div className={compte('absent') ? 'alerte' : ''}>
            <b>{compte('absent')}</b>
            <small>Absents</small>
          </div>
          <div>
            <b>{d.data.eleves.length}</b>
            <small>{d.data.faite ? 'Appel fait' : 'Effectif'}</small>
          </div>
        </div>
        {d.horsLigne && <p className="hors-ligne">Pas de réseau : liste gardée sur le téléphone. L’appel sera envoyé dès le retour du réseau.</p>}
        <Note>{error}</Note>
        <Note kind="ok">{ok}</Note>
        <ol className="ap-liste">
          {d.data.eleves.map((e, i) => {
            const absent = statuts[e.id] === 'absent'
            return (
              <li key={e.id} className={absent ? 'absent' : ''}>
                <span className="ev-num">{i + 1}</span>
                <span className="ev-nom" data-brut>{`${e.last_name} ${e.first_name}`}</span>
                <span className="ap-choix" role="group" aria-label={`${e.last_name} ${e.first_name}`}>
                  <button type="button" aria-pressed={!absent} onClick={() => setStatuts((x) => ({ ...x, [e.id]: 'present' }))}>
                    P
                  </button>
                  <button type="button" className="a" aria-pressed={absent} onClick={() => setStatuts((x) => ({ ...x, [e.id]: 'absent' }))}>
                    A
                  </button>
                </span>
              </li>
            )
          })}
        </ol>
        <p className="ap-aide">Tout le monde est présent par défaut : touchez A pour chaque absent. Les parents des absents sont prévenus.</p>
        <div className="ev-barre">
          <span>
            <b>{compte('absent')}</b> {compte('absent') > 1 ? 'absents' : 'absent'}
          </span>
          <button type="button" className="btn" disabled={busy} onClick={enregistrer}>
            {busy ? 'Enregistrement…' : d.data.faite ? 'Mettre à jour' : 'Enregistrer l’appel'}
          </button>
        </div>
      </div>
    )

  return (
    <>
      <h1 className="page-title">
        {modif ? 'Appel' : 'Présences'}
        {d.data ? ` · ${d.data.classe}` : ''}
      </h1>
      <input
        className="input"
        type="date"
        value={date}
        max={aujourdhui()}
        onChange={(e) => {
          setDate(e.target.value)
          setPeriode(null)
          setAuto(true)
        }}
        style={{ marginBottom: 12 }}
      />
      {d.data && !d.data.cours?.length && (
        <Note kind="ok">Pas d’emploi du temps pour ce jour : l’appel vaut pour toute la journée. L’établissement saisit l’emploi du temps de chaque classe.</Note>
      )}
      {d.data?.cours?.length > 0 && (
        <div className="chips">
          {d.data.cours.map((c) => (
            <button key={c.periode} type="button" className="chip" aria-pressed={periode === c.periode} onClick={() => setPeriode(c.periode)}>
              {c.fait ? '✓ ' : ''}
              {c.debut} {c.matiere || ''}
            </button>
          ))}
        </div>
      )}
      {!modif && d.data?.resume?.length > 0 && (
        <div className="card" style={{ marginBottom: 12, fontSize: 14 }}>
          <b>Résumé du jour</b>
          {d.data.resume.map((r) => (
            <div key={r.heure} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted">{r.heure}</span>
              <span>
                {r.absents} absent(s)
              </span>
            </div>
          ))}
        </div>
      )}
      {d.data && (
        <p className="lede" style={{ marginBottom: 10 }}>
          {!modif && !d.data.faite
            ? 'L’appel n’a pas encore été fait pour ce jour (il est fait en classe par l’enseignant).'
            : (
              <>
                {d.data.faite && modif ? '✓ Appel déjà fait ce jour (modifiable). ' : ''}
                {compte('present')} présent(s) · {compte('absent')} absent(s)
              </>
            )}
        </p>
      )}
      {d.horsLigne && <p className="hors-ligne">Pas de réseau : liste gardée sur le téléphone. L’appel sera envoyé dès le retour du réseau.</p>}
      {d.error && !d.data && <Note>{d.error}</Note>}
      <Note>{error}</Note>
      <Note kind="ok">{ok}</Note>
      {d.loading && !d.data && <p className="muted">Chargement…</p>}
      {d.data && (
        <>
          <ul className="rows">
            {d.data.eleves.map((e, i) => (
              <li className="row" key={e.id} style={{ padding: '9px 12px', flexWrap: 'wrap' }}>
                <span className="muted" style={{ width: 22, fontSize: 13 }}>
                  {i + 1}
                </span>
                <div className="row-main">
                  <div className="row-title" style={{ fontSize: 15 }}>
                    {e.last_name} {e.first_name}
                  </div>
                </div>
                {!modif ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, color: (STATUTS.find((s) => s[0] === e.status) || [])[3] || 'var(--muted)' }}>
                      {e.status ? (STATUTS.find((s) => s[0] === e.status) || [])[2] || 'Présent' : '—'}
                    </span>
                  </span>
                ) : (
                <div style={{ display: 'flex', gap: 4 }}>
                  {STATUTS.map(([k, lettre, titre, couleur]) => (
                    <button
                      key={k}
                      type="button"
                      title={titre}
                      aria-label={titre}
                      onClick={() => setStatuts((x) => ({ ...x, [e.id]: k }))}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        cursor: 'pointer',
                        font: '800 14px/1 var(--font-body)',
                        border: `1.5px solid ${statuts[e.id] === k ? couleur : 'var(--line)'}`,
                        background: statuts[e.id] === k ? couleur : 'var(--card)',
                        color: statuts[e.id] === k ? '#fff' : 'var(--muted)',
                      }}
                    >
                      {lettre}
                    </button>
                  ))}
                </div>
                )}
              </li>
            ))}
          </ul>
          {modif && (
            <p className="muted" style={{ fontSize: 13, margin: '8px 4px' }}>
              Touchez A pour les absents. Le cours est choisi automatiquement selon l’emploi du temps de la classe ; les parents des absents sont
              prévenus.
            </p>
          )}
          {modif && (
            <button type="button" className="btn btn-block" style={{ marginTop: 8 }} disabled={busy} onClick={enregistrer}>
              {busy ? 'Enregistrement…' : 'Enregistrer l’appel'}
            </button>
          )}
        </>
      )}
    </>
  )
}
