import { useState } from 'react'
import { useAuth } from '../auth.jsx'
import { Field, Note } from '../ui.jsx'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <main className="sheet">
        <p className="brand-line">School</p>
        <h1 className="page-title">Connexion</h1>
        <p className="lede">Utilisez l’adresse e-mail que l’école vous a communiquée.</p>
        <div className="gap" />
        <form onSubmit={submit}>
          <Field label="Adresse e-mail">
            <input
              className="input"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Mot de passe">
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Note>{error}</Note>
          <div className="actions">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Connexion…' : 'Se connecter'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
