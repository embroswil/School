import { useState } from 'react'
import { useAuth } from '../auth.jsx'
import { ChampMotDePasse, Field, Note, PageAuth } from '../ui.jsx'

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
      let retour = '/'
      try {
        retour = sessionStorage.getItem('sukul-apres-connexion') || '/'
        sessionStorage.removeItem('sukul-apres-connexion')
      } catch {
        /* stockage indisponible */
      }
      window.location.hash = retour
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <PageAuth
      titre="Connexion"
      sousTitre="Accédez à votre espace Sùkûl."
      pied={
        <>
          Pas encore de compte ? <a href="#/inscription">Créer un compte</a>
        </>
      }
    >
      <form className="card" onSubmit={onSubmit}>
        <Field label="Adresse e-mail">
          <input className="input" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="vous@exemple.com" value={email} onChange={(e) => setEmail(e.target.value.trim())} required />
        </Field>
        <Field label="Mot de passe">
          <ChampMotDePasse value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <p className="ea-lien-droite">
          <a href="#/mot-de-passe-oublie">Mot de passe oublié ?</a>
        </p>
        <Note>{error}</Note>
        <button className="btn btn-block" type="submit" disabled={busy}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </PageAuth>
  )
}
