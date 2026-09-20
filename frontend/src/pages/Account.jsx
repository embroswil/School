import { useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { Field, Note } from '../ui.jsx'
import { ROLE_LABEL, fullName } from '../format.js'

export default function Account() {
  const { user, logout } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/api/auth/change-password', { currentPassword: current, newPassword: next })
      // Le serveur a fermé toutes les sessions : on repart sur la page de connexion.
      await logout()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <>
      <h1 className="page-title">Mon compte</h1>
      <p className="row-title">{fullName(user.firstName, user.lastName)}</p>
      <p className="muted">
        {ROLE_LABEL[user.role]}, {user.email}
      </p>
      <div className="gap" />
      <form onSubmit={submit}>
        <h2 className="section-title">Changer de mot de passe</h2>
        <Field label="Mot de passe actuel">
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="Nouveau mot de passe (8 caractères minimum)">
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Note>{error}</Note>
        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Changer le mot de passe'}
          </button>
        </div>
        <p className="muted">Vous serez déconnecté et devrez vous reconnecter avec le nouveau mot de passe.</p>
      </form>
    </>
  )
}
