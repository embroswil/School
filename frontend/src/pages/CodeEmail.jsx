import { useState } from 'react'
import { api } from '../api.js'
import { Field, Note } from '../ui.jsx'

// Saisie d'un code a 6 chiffres recu par email, avec renvoi du code
export function SaisieCode({ email, envoyer, onValide, libelle = 'Confirmer' }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function renvoyer() {
    setError('')
    setInfo('')
    try {
      await api.post(envoyer, { email }, { auth: false })
      setInfo('Un nouveau code vient d’être envoyé.')
    } catch (err) {
      setError(err.message)
    }
  }
  async function valider(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await onValide(code.replace(/\s/g, ''))
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  return (
    <form className="card" onSubmit={valider}>
      <Field label="Code reçu par email">
        <input
          className="input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
          style={{ fontSize: 26, letterSpacing: 8, textAlign: 'center', fontWeight: 700 }}
          required
        />
      </Field>
      <Note>{error}</Note>
      <Note kind="ok">{info}</Note>
      <button className="btn btn-block" type="submit" disabled={busy || code.replace(/\s/g, '').length !== 6}>
        {busy ? 'Vérification…' : libelle}
      </button>
      <p className="muted" style={{ fontSize: 14, marginTop: 12, textAlign: 'center' }}>
        Pas reçu ? Regardez dans les courriers indésirables (spam), ou{' '}
        <button type="button" onClick={renvoyer} style={{ border: 0, background: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', padding: 0, font: 'inherit' }}>
          renvoyez le code
        </button>
        .
      </p>
    </form>
  )
}

// Confirmation de l'email apres l'inscription (ou depuis l'espace connecte)
export function VerificationEmail({ email, onConfirme, onPlusTard }) {
  return (
    <>
      <div style={{ fontSize: 48, textAlign: 'center' }}>✉️</div>
      <h1 className="page-title" style={{ textAlign: 'center' }}>
        Vérifiez votre email
      </h1>
      <p className="lede" style={{ textAlign: 'center' }}>
        Nous avons envoyé un code à 6 chiffres à <b>{email}</b>.
      </p>
      <SaisieCode
        email={email}
        envoyer="/api/codes/verification/envoyer"
        onValide={async (code) => {
          await api.post('/api/codes/verification/confirmer', { email, code }, { auth: false })
          await onConfirme()
        }}
      />
      {onPlusTard && (
        <p style={{ textAlign: 'center', marginTop: 14 }}>
          <button type="button" onClick={onPlusTard} className="muted" style={{ border: 0, background: 'none', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>
            Confirmer plus tard
          </button>
        </p>
      )}
    </>
  )
}

// Page « Mot de passe oublie » : email, puis code + nouveau mot de passe
export default function MotDePasseOublie() {
  const [email, setEmail] = useState('')
  const [etape, setEtape] = useState(1)
  const [mdp, setMdp] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [fini, setFini] = useState(false)

  async function demander(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.post('/api/codes/mot-de-passe/envoyer', { email }, { auth: false })
      setEtape(2)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <div className="public">
      <header className="public-top">
        <a className="brand" href="#/">
          School<span>.</span>
        </a>
        <a href="#/connexion" className="muted" style={{ fontWeight: 700 }}>
          Se connecter
        </a>
      </header>
      <main className="public-main">
        {fini ? (
          <div style={{ textAlign: 'center', paddingTop: 30 }}>
            <div style={{ fontSize: 52 }}>✅</div>
            <h1 className="page-title">Mot de passe modifié</h1>
            <p className="lede">Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
            <a className="btn" href="#/connexion">
              Se connecter
            </a>
          </div>
        ) : etape === 1 ? (
          <>
            <h1 className="page-title">Mot de passe oublié</h1>
            <p className="lede">Indiquez l’adresse email de votre compte : nous vous enverrons un code pour choisir un nouveau mot de passe.</p>
            <form className="card" onSubmit={demander}>
              <Field label="Adresse e-mail">
                <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
              <Note>{error}</Note>
              <button className="btn btn-block" type="submit" disabled={busy}>
                {busy ? 'Envoi…' : 'Recevoir un code'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="page-title">Nouveau mot de passe</h1>
            <p className="lede">
              Si un compte existe avec <b>{email}</b>, un code à 6 chiffres vient d’y être envoyé (valable 15 minutes).
            </p>
            <div className="card" style={{ marginBottom: 12 }}>
              <Field label="Nouveau mot de passe (8 caractères minimum)">
                <input className="input" type="password" autoComplete="new-password" minLength={8} value={mdp} onChange={(e) => setMdp(e.target.value)} required />
              </Field>
            </div>
            <SaisieCode
              email={email}
              envoyer="/api/codes/mot-de-passe/envoyer"
              libelle="Changer le mot de passe"
              onValide={async (code) => {
                if (mdp.length < 8) throw new Error('Choisissez d’abord un mot de passe de 8 caractères minimum.')
                await api.post('/api/codes/mot-de-passe/changer', { email, code, motDePasse: mdp }, { auth: false })
                setFini(true)
              }}
            />
            <button type="button" className="back" style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={() => setEtape(1)}>
              ← Changer d’adresse email
            </button>
          </>
        )}
      </main>
    </div>
  )
}
