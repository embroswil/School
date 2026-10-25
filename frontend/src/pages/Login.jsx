import { useState } from 'react'
import { useAuth } from '../auth.jsx'
import { Field, Note } from '../ui.jsx'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
      window.location.hash = '/'
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="public login">
      <header className="public-top">
        <a className="brand" href="#/">
          School<span>.</span>
        </a>
      </header>
      <main className="public-main">
        <h1 className="page-title">Bon retour 👋</h1>
        <p className="lede">Connectez-vous à votre espace.</p>
        <form className="card" onSubmit={onSubmit}>
          <Field label="Adresse e-mail">
            <input
              className="input"
              type="email"
              autoComplete="email"
              placeholder="vous@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Mot de passe">
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Note>{error}</Note>
          <button className="btn btn-block" type="submit" disabled={busy}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        <p className="muted" style={{ textAlign: 'center', marginTop: 20 }}>
          Pas encore de compte ? <a href="#/inscription">Créer un compte</a>
        </p>
      </main>
    </div>
  )
}
