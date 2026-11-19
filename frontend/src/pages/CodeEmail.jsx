import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { ChampMotDePasse, Field, Note, PageAuth } from '../ui.jsx'

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
        Pas reçu ? Vérifiez vos courriers indésirables (spam), ou{' '}
        <button type="button" onClick={renvoyer} style={{ border: 0, background: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', padding: 0, font: 'inherit' }}>
          renvoyez le code
        </button>
        .
      </p>
    </form>
  )
}

// Confirmation de l'email apres l'inscription (ou depuis l'espace connecte)
export function VerificationEmail({ email, canal, destination, onConfirme, onPlusTard }) {
  const wa = canal === 'whatsapp'
  return (
    <>
      <div style={{ fontSize: 48, textAlign: 'center' }}>{wa ? '💬' : '✉️'}</div>
      <h1 className="page-title" style={{ textAlign: 'center' }}>
        {wa ? 'Regardez votre WhatsApp' : 'Vérifiez votre email'}
      </h1>
      <p className="lede" style={{ textAlign: 'center' }}>
        {wa ? (
          <>
            Nous avons envoyé un code à 6 chiffres <b>sur WhatsApp</b>, au <b>{destination}</b>.
          </>
        ) : canal === 'email' || /@/.test(email) ? (
          <>
            Nous avons envoyé un code à 6 chiffres à <b>{destination || email}</b>.
          </>
        ) : (
          <>Le code n’a pas encore pu être envoyé : touchez « renvoyez le code » ci-dessous dans un instant.</>
        )}
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

// Page « Mot de passe oublie » : 1) adresse ou numero, 2) code + nouveau mot de passe, 3) confirmation
export default function MotDePasseOublie() {
  const [email, setEmail] = useState('')
  const [etape, setEtape] = useState(1)
  const [canal, setCanal] = useState('')
  const [code, setCode] = useState('')
  const [mdp, setMdp] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [attente, setAttente] = useState(0)

  // Un nouveau code ne peut etre demande qu'une fois par minute
  useEffect(() => {
    if (attente <= 0) return undefined
    const t = setTimeout(() => setAttente(attente - 1), 1000)
    return () => clearTimeout(t)
  }, [attente])

  async function envoyerLeCode() {
    const r = await api.post('/api/codes/mot-de-passe/envoyer', { email: email.trim() }, { auth: false })
    setCanal(r?.data?.canal || '')
    setAttente(60)
  }
  async function demander(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await envoyerLeCode()
      setCode('')
      setMdp('')
      setInfo('')
      setEtape(2)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  async function renvoyer() {
    setError('')
    setInfo('')
    try {
      await envoyerLeCode()
      setInfo('Un nouveau code vient d’être envoyé.')
    } catch (err) {
      setError(err.message)
    }
  }
  async function changer(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (mdp.length < 8) return setError('Mot de passe : 8 caractères minimum')
    setBusy(true)
    try {
      await api.post('/api/codes/mot-de-passe/changer', { email: email.trim(), code, motDePasse: mdp }, { auth: false })
      setEtape(3)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const titres = { 1: 'Mot de passe oublié', 2: 'Saisissez le code', 3: 'Mot de passe modifié' }
  const sousTitres = {
    1: 'Indiquez votre adresse e-mail : vous recevrez un code à 6 chiffres.',
    2: canal === 'whatsapp' ? 'Un code à 6 chiffres vient d’être envoyé sur WhatsApp.' : 'Un code à 6 chiffres vient d’être envoyé, si un compte correspond à cette adresse.',
    3: 'Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.',
  }

  return (
    <PageAuth
      titre={titres[etape]}
      sousTitre={sousTitres[etape]}
      onRetour={etape === 2 ? () => setEtape(1) : undefined}
      pied={
        etape !== 3 && (
          <>
            Vous vous en souvenez ? <a href="#/connexion">Se connecter</a>
          </>
        )
      }
    >
      {etape === 1 && (
        <form className="card" onSubmit={demander}>
          <Field label="Adresse e-mail">
            <input className="input" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="vous@exemple.com" value={email} onChange={(e) => setEmail(e.target.value.trim())} required />
          </Field>
          <Note>{error}</Note>
          <button className="btn btn-block" type="submit" disabled={busy || !email.trim()}>
            {busy ? 'Envoi…' : 'Recevoir le code'}
          </button>
        </form>
      )}

      {etape === 2 && (
        <form className="card" onSubmit={changer}>
          <p className="mdp-destinataire" data-brut>
            {email.trim()}
          </p>
          <Field label="Code à 6 chiffres">
            <input
              className="input mdp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
            />
          </Field>
          <Field label="Nouveau mot de passe">
            <ChampMotDePasse autoComplete="new-password" minLength={8} placeholder="8 caractères minimum" value={mdp} onChange={(e) => setMdp(e.target.value)} />
          </Field>
          <Note>{error}</Note>
          <Note kind="ok">{info}</Note>
          <button className="btn btn-block" type="submit" disabled={busy || code.length !== 6 || mdp.length < 8}>
            {busy ? 'Vérification…' : 'Changer le mot de passe'}
          </button>
          <div className="mdp-actions">
            <button type="button" onClick={renvoyer} disabled={attente > 0}>
              {attente > 0 ? `Renvoyer dans ${attente} s` : 'Renvoyer le code'}
            </button>
            <button type="button" onClick={() => { setError(''); setInfo(''); setEtape(1) }}>
              Modifier l’adresse
            </button>
          </div>
          <p className="mdp-aide">Rien reçu ? Vérifiez l’adresse saisie et vos courriers indésirables. Le code est valable 15 minutes.</p>
        </form>
      )}

      {etape === 3 && (
        <div className="card mdp-fini">
          <span className="mdp-coche" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <p>Par sécurité, tous vos appareils ont été déconnectés.</p>
          <a className="btn btn-block" href="#/connexion">
            Se connecter
          </a>
        </div>
      )}
    </PageAuth>
  )
}
