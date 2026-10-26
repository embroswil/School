import { useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useApi } from '../hooks.js'
import { Note } from '../ui.jsx'

const ROLES = { parent: 'Parent', student: 'Élève', teacher: 'Enseignant' }
const quand = (d) =>
  new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function Conversation({ id }) {
  const { user } = useAuth()
  const etablissement = user.role === 'principal'
  const conv = useApi(`/api/boite/messages/${id}`)
  const [texte, setTexte] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function repondre(e) {
    e.preventDefault()
    if (!texte.trim()) return
    setError('')
    setBusy(true)
    try {
      await api.post(`/api/boite/messages/${id}`, { body: texte })
      setTexte('')
      conv.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const d = conv.data
  return (
    <>
      <a className="back" href="#/messages">
        ← Messages
      </a>
      {conv.loading && <p className="muted">Chargement…</p>}
      {conv.error && <Note>{conv.error}</Note>}
      {d && (
        <>
          <h1 className="page-title" style={{ fontSize: 22 }}>
            {d.conversation.subject}
          </h1>
          {etablissement && d.auteur && (
            <p className="lede" style={{ marginBottom: 12 }}>
              {d.auteur.first_name} {d.auteur.last_name} · {ROLES[d.auteur.role] || ''}
              {d.auteur.phone && (
                <>
                  {' '}
                  · <a href={`tel:${d.auteur.phone}`}>{d.auteur.phone}</a>
                </>
              )}
            </p>
          )}
          <div style={{ display: 'grid', gap: 10 }}>
            {d.messages.map((m) => {
              const moi = etablissement ? m.from_school : !m.from_school
              return (
                <div
                  key={m.id}
                  style={{
                    justifySelf: moi ? 'end' : 'start',
                    maxWidth: '85%',
                    background: moi ? 'var(--primary)' : 'var(--card)',
                    color: moi ? '#fff' : 'var(--text)',
                    border: moi ? 0 : '1px solid var(--line)',
                    borderRadius: 18,
                    padding: '10px 14px',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.body}
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                    {m.from_school ? 'Établissement' : `${m.first_name || ''}`} · {quand(m.created_at)}
                  </div>
                </div>
              )
            })}
          </div>
          <form onSubmit={repondre} style={{ marginTop: 16 }}>
            <textarea className="input" placeholder="Votre réponse…" value={texte} onChange={(e) => setTexte(e.target.value)} />
            <Note>{error}</Note>
            <button className="btn btn-block" type="submit" disabled={busy || !texte.trim()} style={{ marginTop: 8 }}>
              {busy ? 'Envoi…' : 'Envoyer'}
            </button>
          </form>
        </>
      )}
    </>
  )
}
