import { useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Field, Note } from '../ui.jsx'

const ROLES = { parent: 'Parent', student: 'Élève', teacher: 'Enseignant' }
const quand = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

export default function Messages() {
  const { user } = useAuth()
  const etablissement = user.role === 'principal'
  const liste = useApi('/api/boite/messages')
  const [ouvert, setOuvert] = useState(false)
  const [f, setF] = useState({ subject: '', body: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function envoyer(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await api.post('/api/boite/messages', f)
      window.location.hash = `/messages/${r.data.id}`
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <>
      <h1 className="page-title">Messages</h1>
      <p className="lede">
        {etablissement
          ? 'Les messages des parents, des élèves et des enseignants de votre établissement.'
          : `Écrivez à ${user.schoolName || 'votre établissement'} : une question, une absence, un document…`}
      </p>

      {!etablissement && (
        <>
          {!ouvert ? (
            <button type="button" className="btn btn-block" onClick={() => setOuvert(true)} style={{ marginBottom: 16 }}>
              ✏️ Nouveau message
            </button>
          ) : (
            <form className="card" onSubmit={envoyer} style={{ marginBottom: 16 }}>
              <Field label="Objet">
                <input className="input" placeholder="ex. Absence de mon enfant" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} required />
              </Field>
              <Field label="Message">
                <textarea className="input" style={{ minHeight: 130 }} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required />
              </Field>
              <Note>{error}</Note>
              <div className="actions">
                <button className="btn" type="submit" disabled={busy}>
                  {busy ? 'Envoi…' : 'Envoyer'}
                </button>
                <button className="btn btn-quiet" type="button" onClick={() => setOuvert(false)}>
                  Annuler
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {liste.loading && <p className="muted">Chargement…</p>}
      {liste.data?.length === 0 && <p className="muted">Aucun message pour le moment.</p>}
      {liste.data?.length > 0 && (
        <ul className="rows">
          {liste.data.map((c) => (
            <a className="row" href={`#/messages/${c.id}`} key={c.id}>
              <span style={{ fontSize: 24 }}>{c.non_lu ? '📩' : '✉️'}</span>
              <div className="row-main">
                <div className="row-title" style={{ fontWeight: c.non_lu ? 800 : 600 }}>
                  {etablissement ? `${c.first_name} ${c.last_name} · ` : ''}
                  {c.subject}
                </div>
                <div className="row-sub">
                  {etablissement && ROLES[c.role] ? `${ROLES[c.role]} · ` : ''}
                  {c.dernier}
                </div>
              </div>
              <span className="row-end">{quand(c.updated_at)}</span>
            </a>
          ))}
        </ul>
      )}
    </>
  )
}
