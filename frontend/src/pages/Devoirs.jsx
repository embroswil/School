import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'

const jour = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : 'sans date')

// Liste des devoirs (partagee avec le suivi des parents et eleves)
export function ListeDevoirs({ devoirs, onSupprimer }) {
  if (!devoirs.length) return <p className="muted">Aucun devoir à faire pour le moment.</p>
  return (
    <ul className="rows">
      {devoirs.map((d) => (
        <li className="row" key={d.id} style={{ alignItems: 'flex-start' }}>
          <div className="row-main">
            <div className="row-sub" style={{ fontWeight: 700, color: 'var(--primary)', textTransform: 'capitalize' }}>
              Pour {jour(d.pour_le)}
            </div>
            <div className="row-title" style={{ whiteSpace: 'normal' }}>
              {d.matiere} · {d.titre}
            </div>
            {d.consigne && (
              <div className="row-sub" style={{ whiteSpace: 'pre-wrap' }}>
                {d.consigne}
              </div>
            )}
            {d.last_name && (
              <div className="row-sub" style={{ fontSize: 12 }}>
                {d.first_name} {d.last_name}
              </div>
            )}
          </div>
          {onSupprimer && d.mien && (
            <button type="button" className="btn btn-quiet btn-danger" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => onSupprimer(d.id)}>
              Retirer
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

// Cahier de textes d'une classe : l'enseignant donne un devoir, tout le monde le voit
export default function Devoirs({ id }) {
  const infos = useApi(`/api/notes/classes/${id}`)
  const liste = useApi(`/api/notes/classes/${id}/devoirs`)
  const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const [f, setF] = useState({ subjectId: '', titre: '', consigne: '', pourLe: demain })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const droits = infos.data?.droits
  const mesMatieres = (infos.data?.matieres || []).filter((m) => droits?.mesMatieres.includes(m.id))

  async function ajouter(e) {
    e.preventDefault()
    setError('')
    setOk('')
    setBusy(true)
    try {
      await api.post(`/api/notes/classes/${id}/devoirs`, { ...f, subjectId: Number(f.subjectId || mesMatieres[0]?.id) })
      setOk('Devoir publié : les élèves et les parents sont notifiés.')
      setF((x) => ({ ...x, titre: '', consigne: '' }))
      liste.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <>
      <h1 className="page-title">Devoirs{infos.data ? ` · ${infos.data.classe.name}` : ''}</h1>
      <p className="lede">Le cahier de textes de la classe : les devoirs à faire, visibles par les élèves et leurs parents.</p>
      {droits?.saisie && (
        <form className="card" onSubmit={ajouter} style={{ marginBottom: 16 }}>
          {mesMatieres.length > 1 && (
            <Field label="Matière">
              <select className="input" value={f.subjectId} onChange={maj('subjectId')} required>
                <option value="">Choisir</option>
                {mesMatieres.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Devoir">
            <input className="input" placeholder="ex. Exercices 3 et 4 page 52" value={f.titre} onChange={maj('titre')} required />
          </Field>
          <Field label="Consigne (facultatif)">
            <textarea className="input" value={f.consigne} onChange={maj('consigne')} />
          </Field>
          <Field label="Pour le">
            <input className="input" type="date" value={f.pourLe} onChange={maj('pourLe')} />
          </Field>
          <Note>{error}</Note>
          <Note kind="ok">{ok}</Note>
          <button className="btn btn-block" type="submit" disabled={busy}>
            {busy ? 'Publication…' : 'Donner le devoir'}
          </button>
        </form>
      )}
      {liste.data && (
        <ListeDevoirs
          devoirs={liste.data}
          onSupprimer={async (did) => {
            await api.delete(`/api/notes/devoirs/${did}`)
            liste.reload()
          }}
        />
      )}
    </>
  )
}
