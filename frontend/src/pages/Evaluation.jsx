import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'
import { mettreEnAttente, retirerAttente } from '../horsligne.js'
import { exporterExcel } from '../export.jsx'

// Saisie des notes d'une evaluation : une ligne par eleve
export default function Evaluation({ id }) {
  const d = useApi(`/api/notes/evaluations/${id}`)
  const [notes, setNotes] = useState({})
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!d.data) return
    setNotes(
      Object.fromEntries(
        d.data.eleves.map((e) => [e.id, { note: e.note === null ? '' : String(Number(e.note)).replace('.', ','), absent: e.absent }]),
      ),
    )
  }, [d.data])

  if (d.error) return <Note>{d.error}</Note>
  if (!d.data) return <p className="muted">Chargement…</p>
  const { evaluation: ev, eleves } = d.data
  const modif = ev.modifiable
  const bareme = Number(ev.bareme)
  const saisies = Object.values(notes).filter((n) => n.note !== '' || n.absent).length

  async function enregistrer(publier) {
    setError('')
    setOk('')
    setBusy(true)
    const corps = {
      notes: Object.entries(notes).map(([sid, n]) => ({
        studentId: Number(sid),
        note: n.absent || n.note === '' ? null : n.note.replace(',', '.'),
        absent: n.absent,
      })),
      publiee: publier ? true : undefined,
    }
    const cle = `notes|${id}`
    try {
      await api.put(`/api/notes/evaluations/${id}`, corps)
      retirerAttente(cle)
      setOk('Notes enregistrées et publiées : parents et élèves sont notifiés, et le résumé apparaît dans le fil de l’établissement.')
      d.reload()
    } catch (err) {
      if (err.status === 0 && mettreEnAttente({ cle, path: `/api/notes/evaluations/${id}`, body: corps, libelle: `Notes ${ev.matiere} · ${ev.classe}` })) {
        setOk('Pas de réseau : les notes sont gardées sur le téléphone. Elles seront envoyées automatiquement dès le retour du réseau.')
      } else setError(err.message)
    }
    setBusy(false)
  }
  async function supprimer() {
    if (!window.confirm('Supprimer cette évaluation et toutes ses notes ?')) return
    await api.delete(`/api/notes/evaluations/${id}`)
    window.history.back()
  }

  const maj = (sid, k, v) => setNotes((x) => ({ ...x, [sid]: { ...x[sid], [k]: v } }))

  const valeurs = Object.values(notes)
    .filter((n) => !n.absent && n.note !== '')
    .map((n) => Number(String(n.note).replace(',', '.')))
    .filter((v) => v >= 0 && v <= bareme)
  const moyenne = valeurs.length ? (valeurs.reduce((a, b) => a + b, 0) / valeurs.length).toFixed(2).replace('.', ',') : '—'
  const absents = Object.values(notes).filter((n) => n.absent).length
  const exporter = () =>
    exporterExcel(`notes-${ev.classe}-${ev.matiere}`.replace(/\s+/g, '-'), [
      {
        nom: `${ev.classe} ${ev.matiere}`,
        lignes: eleves.map((e, i) => {
          const n = notes[e.id] || {}
          return {
            'N°': i + 1,
            Nom: e.last_name,
            'Prénom(s)': e.first_name,
            [`Note /${bareme}`]: n.absent ? 'Abs' : n.note === '' || n.note === undefined ? '' : Number(String(n.note).replace(',', '.')),
          }
        }),
      },
    ])

  return (
    <div className="ev-page">
      <div className="page-tete">
        <div>
          <h1 className="page-title" data-brut>{ev.titre || 'Évaluation'}</h1>
          <p className="muted">{`${ev.matiere} · ${ev.classe} · Séquence ${ev.sequence} · noté sur ${bareme}`}</p>
        </div>
        <em className={`ev-statut ${ev.publiee ? 'publiee' : ''}`}>{ev.publiee ? 'Publiée' : 'Brouillon'}</em>
      </div>

      {d.horsLigne && <p className="hors-ligne">Pas de réseau : notes gardées sur le téléphone, telles qu’à votre dernière connexion.</p>}
      {!modif && (
        <div className="note note-ok" style={{ fontWeight: 400 }}>
          Consultation : seules les enseignantes et enseignants de cette matière peuvent modifier ces notes.
        </div>
      )}

      <div className="ev-chiffres">
        <div>
          <b>{`${saisies}/${eleves.length}`}</b>
          <small>Saisies</small>
        </div>
        <div>
          <b>{moyenne}</b>
          <small>Moyenne</small>
        </div>
        <div>
          <b>{absents}</b>
          <small>Absents</small>
        </div>
      </div>

      <Note>{error}</Note>
      <Note kind="ok">{ok}</Note>

      <ol className="ev-liste">
        {eleves.map((e, i) => {
          const n = notes[e.id] || { note: '', absent: false }
          const val = Number(String(n.note).replace(',', '.'))
          const faux = n.note !== '' && !(val >= 0 && val <= bareme)
          return (
            <li key={e.id} className={n.absent ? 'absent' : ''}>
              <span className="ev-num">{i + 1}</span>
              <span className="ev-nom" data-brut>{`${e.last_name} ${e.first_name}`}</span>
              {!modif ? (
                <b className="ev-lu">{n.absent ? 'Abs' : n.note === '' ? '—' : `${n.note}/${bareme}`}</b>
              ) : (
                <>
                  <button type="button" className="ev-abs" aria-pressed={n.absent} onClick={() => maj(e.id, 'absent', !n.absent)}>
                    Abs
                  </button>
                  <input
                    className={`ev-note ${faux ? 'faux' : ''}`}
                    inputMode="decimal"
                    disabled={n.absent}
                    value={n.absent ? '' : n.note}
                    placeholder={`/${bareme}`}
                    aria-label={`Note de ${e.last_name} ${e.first_name}`}
                    onChange={(ev2) => maj(e.id, 'note', ev2.target.value)}
                  />
                </>
              )}
            </li>
          )
        })}
      </ol>

      <div className="ev-secondaire">
        <button type="button" className="btn btn-quiet" onClick={exporter}>
          Exporter en Excel
        </button>
        {modif && (
          <button type="button" className="btn btn-quiet btn-danger" onClick={supprimer}>
            Supprimer l’évaluation
          </button>
        )}
      </div>

      {modif && (
        <div className="ev-barre">
          <span>
            <b>{`${saisies}/${eleves.length}`}</b> notes saisies
          </span>
          <button type="button" className="btn" disabled={busy} onClick={() => enregistrer(true)}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}
    </div>
  )
}
